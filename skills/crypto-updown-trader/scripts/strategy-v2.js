#!/usr/bin/env node
'use strict';
/**
 * strategy-v2.js — probability + EV engine (the new brain).
 *
 * For the current window it: builds features, estimates P(up) from where spot
 * sits vs the strike and time left, compares to the price the market charges,
 * and bets ONLY when edge net of costs is positive — sized by fractional Kelly.
 *
 * It writes ONE rich record per window to windows.jsonl — a single source of
 * truth for both execution and analytics (fixes the old two-store split).
 * Crucially it applies every gate BEFORE logging the decision, so the log
 * never contains a "bet" that wasn't really taken (no phantom bets).
 *
 * Modes:
 *   shadow  — evaluate + log, place NO real bet (paper trading). DEFAULT.
 *   live    — emit a __SIGNAL__ line so cycle-v2.sh places the bet.
 *
 * Usage:
 *   node strategy-v2.js --asset btc --tf 15m [--mode shadow|live] [--json]
 */
const fs = require('fs');
const path = require('path');
const model = require('./lib/model');
const market = require('./lib/market');

const DIR = __dirname;
const WINDOWS_FILE = path.join(DIR, 'windows.jsonl');
const CONFIG_FILE = path.join(DIR, 'config.json');

const DEFAULT_V2 = {
  mode: 'shadow',
  minEdge: 0.04, // require >=4 prob-points edge to cover spread/gas/slippage
  kellyFraction: 0.25, // quarter-Kelly
  maxBetFraction: 0.02, // never risk >2% of bankroll on one window
  bankroll: 100,
  tieBias: 0.02, // small structural nudge toward UP (ties resolve UP)
  volLookback: 30,
  maxPrice: 0.97, // don't buy near-certainty (no room, fat tail)
  minMinutesLeft: 1.5, // don't bet in the last ~90s (execution too slow)
  maxMinutesLeft: 14, // wait for some realized move before pricing
};

function loadConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return { ...DEFAULT_V2, ...(c.v2 || {}) , _root: c };
  } catch {
    return { ...DEFAULT_V2, _root: {} };
  }
}

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}
function flag(name) {
  return process.argv.includes(name);
}

async function main() {
  const cfg = loadConfig();
  const asset = (arg('--asset', cfg._root.asset || 'btc') || 'btc').toLowerCase();
  const tf = arg('--tf', cfg._root.timeframe || '15m');
  const mode = arg('--mode', cfg.mode) || 'shadow';
  const asJson = flag('--json');

  const f = await market.buildFeatures(asset, tf, cfg);

  // --- Guards that make the window un-bettable regardless of edge ---
  const guards = [];
  if (f.error) guards.push(f.error);
  if (!f.marketFound) guards.push('market not on gamma yet');
  if (f.marketClosed) guards.push('market already closed');
  if (f.upPrice == null || f.downPrice == null) guards.push('no market prices');
  if (f.minutesLeft != null && f.minutesLeft < cfg.minMinutesLeft)
    guards.push(`only ${f.minutesLeft?.toFixed(1)}m left (< ${cfg.minMinutesLeft})`);
  if (f.minutesLeft != null && f.minutesLeft > cfg.maxMinutesLeft)
    guards.push(`too early (${f.minutesLeft?.toFixed(1)}m left)`);

  let d;
  if (guards.length) {
    d = { decision: 'NO_BET', side: null, size: 0, reason: guards.join('; '),
          pUp: null, pDown: null };
  } else {
    d = model.decide(
      {
        spot: f.spot,
        strike: f.strike,
        sigmaPerMin: f.sigmaPerMin,
        minutesLeft: f.minutesLeft,
        upPrice: f.upPrice,
        downPrice: f.downPrice,
      },
      cfg
    );
  }

  const willBet = d.decision !== 'NO_BET';
  const placed = willBet && mode === 'live';

  const record = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    asset,
    tf,
    slug: f.slug || (f.window && f.window.slug),
    mode,
    // features
    spot: f.spot != null ? model.round(f.spot, 2) : null,
    strike: f.strike != null ? model.round(f.strike, 2) : null,
    distancePct: f.distancePct != null ? model.round(f.distancePct, 4) : null,
    sigmaPerMin: f.sigmaPerMin != null ? model.round(f.sigmaPerMin, 6) : null,
    minutesLeft: f.minutesLeft != null ? model.round(f.minutesLeft, 2) : null,
    // model + market
    pUp: d.pUp,
    pDown: d.pDown,
    upPrice: f.upPrice,
    downPrice: f.downPrice,
    edgeUp: d.edgeUp,
    edgeDown: d.edgeDown,
    evUp: d.evUp,
    evDown: d.evDown,
    // decision
    decision: d.decision,
    side: d.side || null,
    price: d.price != null ? d.price : null, // price of the chosen side
    modelP: d.modelP != null ? d.modelP : null,
    edge: d.edge != null ? d.edge : null,
    ev: d.ev != null ? d.ev : null,
    kellyFrac: d.kellyFrac != null ? d.kellyFrac : null,
    size: d.size || 0,
    reason: d.reason,
    placed,
    marketTitle: f.marketTitle || null,
    // filled by resolve-windows.js after the window closes:
    resolved: false,
    winner: null,
    outcome: null, // WIN | LOSS
    paperPnl: null, // realized P&L (paper in shadow, actual-model in live)
  };

  try {
    fs.appendFileSync(WINDOWS_FILE, JSON.stringify(record) + '\n');
  } catch (e) {
    console.error('⚠️  could not write windows.jsonl:', e.message);
  }

  if (asJson) {
    console.log(JSON.stringify(record));
  } else {
    printHuman(record);
  }

  // Machine-readable line for cycle-v2.sh. In shadow mode we force NO_BET so
  // no capital moves even if the operator wires it to a bettor by mistake.
  const sig = placed ? record.decision : 'NO_BET';
  console.log(
    `__SIGNAL_V2__:${sig}:${record.side || 'NONE'}:${record.size}:${record.price || 0}:${record.spot || 0}:${record.slug || ''}`
  );
}

function printHuman(r) {
  const arrow = r.side === 'UP' ? '⬆️' : r.side === 'DOWN' ? '⬇️' : '⏸️';
  console.log('='.repeat(56));
  console.log(`🧠 ${r.asset.toUpperCase()} ${r.tf} — ${r.mode.toUpperCase()} mode`);
  if (r.spot != null) {
    console.log(
      `   spot $${r.spot} vs strike $${r.strike}  (${r.distancePct >= 0 ? '+' : ''}${r.distancePct}%)  |  ${r.minutesLeft}m left  |  σ/min ${r.sigmaPerMin}`
    );
  }
  if (r.pUp != null) {
    console.log(`   model P(up)=${(r.pUp * 100).toFixed(1)}%  market UP=${fmtPct(r.upPrice)} DOWN=${fmtPct(r.downPrice)}`);
    console.log(`   edge UP ${fmtPP(r.edgeUp)}  DOWN ${fmtPP(r.edgeDown)}   |   EV/$ UP ${fmtNum(r.evUp)}  DOWN ${fmtNum(r.evDown)}`);
  }
  if (r.decision === 'NO_BET') {
    console.log(`   ${arrow} NO_BET — ${r.reason}`);
  } else {
    console.log(`   ${arrow} ${r.decision} @ ${fmtPct(r.price)}  size $${r.size}  (edge ${fmtPP(r.edge)}, EV/$ ${fmtNum(r.ev)})`);
    console.log(`   ${r.placed ? '💰 LIVE bet emitted' : '📝 paper only (shadow)'}`);
  }
  console.log('='.repeat(56));
}

const fmtPct = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
const fmtPP = (x) => (x == null ? 'n/a' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}pp`);
const fmtNum = (x) => (x == null ? 'n/a' : (x >= 0 ? '+' : '') + x.toFixed(3));

main().catch((e) => {
  console.error('❌ strategy-v2 error:', e.message);
  process.exit(1);
});
