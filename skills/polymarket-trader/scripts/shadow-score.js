#!/usr/bin/env node
/**
 * Score shadow-mode recommendations against actual market resolutions.
 *
 * This is the referee for the proving protocol. It reports what matters:
 *   - EV per dollar staked (at real entry prices), NOT raw win rate
 *   - Weather model calibration: when the model said 80%, did it happen 80%?
 *   - Progress toward the proving thresholds in config ("proving" section)
 *
 * Verdict rules (defaults, override in config.proving):
 *   btc:     needs ≥200 resolved shadow bets AND EV ≥ +5%/$ to go live
 *   weather: needs ≥50 resolved shadow bets AND EV ≥ +5%/$ to scale beyond minimum size
 *
 * Usage:
 *   node shadow-score.js                  resolve pending + full report
 *   node shadow-score.js --resolve-only   just resolve (used by shadow-cycle)
 *   node shadow-score.js --include-flagged  include blackout-flagged BTC bets in the headline
 */

const fs = require('fs');
const path = require('path');

const SHADOW_FILE = path.join(__dirname, 'shadow.jsonl');
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

let config = {};
try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch {}
const proving = config.proving || {};
const THRESHOLDS = {
  btc: { minResolved: proving.btcMinResolvedBets ?? 200, minEv: proving.minEvPerDollar ?? 0.05 },
  weather: { minResolved: proving.weatherMinResolvedBets ?? 50, minEv: proving.minEvPerDollar ?? 0.05 },
};

const args = process.argv.slice(2);
const resolveOnly = args.includes('--resolve-only');
const includeFlagged = args.includes('--include-flagged');

function loadLines() {
  try {
    return fs.readFileSync(SHADOW_FILE, 'utf8').split('\n').filter(Boolean).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

async function fetchMarket(slug) {
  const res = await fetch(`https://gamma-api.polymarket.com/markets?slug=${slug}`, {
    headers: { 'User-Agent': 'polymarket-trader/1.0 (shadow)' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? data[0] : null;
}

async function resolvePending(lines) {
  const resolved = new Set(lines.filter(d => d.action === 'shadow-resolve').map(d => d.slug));
  const pending = lines.filter(d => d.result === 'shadow' && d.slug && !resolved.has(d.slug));
  let n = 0;
  for (const bet of pending) {
    try {
      const m = await fetchMarket(bet.slug);
      if (!m || !m.closed) continue;
      let prices = [];
      try { prices = JSON.parse(m.outcomePrices || '[]').map(Number); } catch {}
      const winnerIndex = prices.findIndex(p => p > 0.9);
      if (winnerIndex < 0) continue;
      const won = winnerIndex === bet.outcomeIndex;
      fs.appendFileSync(SHADOW_FILE, JSON.stringify({
        time: new Date().toISOString(), action: 'shadow-resolve',
        slug: bet.slug, strategy: bet.strategy, winnerIndex,
        result: won ? '✅ WON' : '❌ LOST',
      }) + '\n');
      n++;
    } catch { /* still open or API hiccup — next cycle */ }
  }
  if (n) console.log(`👻 Resolved ${n} shadow bet(s)`);
  return n;
}

function report(lines) {
  const resolves = {};
  for (const d of lines) if (d.action === 'shadow-resolve') resolves[d.slug] = d;

  const stats = {};
  let flaggedExcluded = 0;
  for (const bet of lines) {
    if (bet.result !== 'shadow') continue;
    if ((bet.flags || []).length > 0 && !includeFlagged) { flaggedExcluded++; continue; }
    const s = stats[bet.strategy] ??= {
      recs: 0, resolved: 0, wins: 0, losses: 0,
      staked: 0, returned: 0, priceSum: 0, priced: 0, cal: [],
    };
    s.recs++;
    const r = resolves[bet.slug];
    if (!r) continue;
    const amount = parseFloat(bet.amount) || 0;
    const price = parseFloat(bet.price) || null;
    s.resolved++;
    s.staked += amount;
    if (price) { s.priceSum += price; s.priced++; }
    const won = String(r.result).includes('WON');
    if (won) { s.wins++; s.returned += price ? amount / price : amount * 1.9; }
    else s.losses++;
    const modelProb = bet.meta?.modelProb;
    if (typeof modelProb === 'number') s.cal.push({ p: modelProb, won });
  }

  console.log('👻 SHADOW REPORT — hypothetical results at real entry prices, no money moved\n');
  if (flaggedExcluded) console.log(`   (${flaggedExcluded} flagged bet(s) excluded — blackout or suspect-edge; rerun with --include-flagged to analyze them)\n`);

  for (const [strategy, s] of Object.entries(stats)) {
    const net = s.returned - s.staked;
    const ev = s.staked > 0 ? net / s.staked : 0;
    const wr = s.resolved ? (100 * s.wins / s.resolved) : null;
    const avgPrice = s.priced ? s.priceSum / s.priced : null;
    const t = THRESHOLDS[strategy] || { minResolved: 100, minEv: 0.05 };

    console.log(`── ${strategy.toUpperCase()} ──`);
    console.log(`   Recommendations: ${s.recs} (${s.resolved} resolved, ${s.recs - s.resolved} pending)`);
    if (s.resolved) {
      console.log(`   Record: ${s.wins}W/${s.losses}L (${wr.toFixed(1)}% WR)${avgPrice ? ` at avg entry ${(avgPrice * 100).toFixed(0)}¢` : ''}`);
      console.log(`   Hypothetical: staked $${s.staked.toFixed(2)}, net ${net >= 0 ? '+' : ''}$${net.toFixed(2)}`);
      console.log(`   ⭐ EV per $1 staked: ${ev >= 0 ? '+' : ''}${(ev * 100).toFixed(1)}¢  (threshold: +${(t.minEv * 100).toFixed(0)}¢)`);
    }

    // Calibration (weather): model prob vs realized frequency
    if (s.cal.length >= 5) {
      console.log('   Calibration (model said → it happened):');
      const buckets = [[0, 0.5], [0.5, 0.75], [0.75, 1.01]];
      for (const [lo, hi] of buckets) {
        const inB = s.cal.filter(c => c.p >= lo && c.p < hi);
        if (!inB.length) continue;
        const said = inB.reduce((a, c) => a + c.p, 0) / inB.length;
        const did = inB.filter(c => c.won).length / inB.length;
        console.log(`     ${(said * 100).toFixed(0)}% predicted → ${(did * 100).toFixed(0)}% realized (n=${inB.length})`);
      }
    }

    // Verdict
    if (s.resolved < t.minResolved) {
      console.log(`   📏 VERDICT: keep shadowing — ${s.resolved}/${t.minResolved} resolved bets`);
    } else if (ev >= t.minEv) {
      console.log(`   ✅ VERDICT: edge holds at n=${s.resolved} — eligible to go live / scale per SKILL.md`);
    } else {
      console.log(`   ❌ VERDICT: no edge at n=${s.resolved} (EV ${(ev * 100).toFixed(1)}¢/$) — do not go live; kill or retune`);
    }
    console.log('');
  }

  if (!Object.keys(stats).length) {
    console.log('   No shadow bets logged yet. Start with: bash machine.sh start shadow');
  }
}

async function main() {
  const lines = loadLines();
  await resolvePending(lines);
  if (!resolveOnly) report(loadLines());
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
