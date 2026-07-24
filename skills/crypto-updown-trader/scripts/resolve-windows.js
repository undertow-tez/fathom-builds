#!/usr/bin/env node
'use strict';
/**
 * resolve-windows.js — fill outcomes into windows.jsonl.
 *
 * For every logged window old enough to have settled, look up the Polymarket
 * result and record: winner (UP/DOWN), whether our (paper) bet won, and the
 * paper P&L. We resolve EVERY window (not just bets) so the backtest can
 * measure model calibration across all of them.
 *
 * Usage: node resolve-windows.js [--verbose]
 */
const fs = require('fs');
const path = require('path');
const market = require('./lib/market');

const WINDOWS_FILE = path.join(__dirname, 'windows.jsonl');
const verbose = process.argv.includes('--verbose');

function readWindows() {
  if (!fs.existsSync(WINDOWS_FILE)) return [];
  return fs
    .readFileSync(WINDOWS_FILE, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** Paper P&L for a bet record given the winner. */
function paperPnl(rec, winner) {
  if (rec.decision === 'NO_BET' || !rec.side || !rec.price || !rec.size) return 0;
  const won = rec.side === winner;
  const shares = rec.size / rec.price; // $1-payout shares bought
  const payout = won ? shares : 0;
  return +(payout - rec.size).toFixed(4);
}

async function main() {
  const rows = readWindows();
  if (!rows.length) {
    console.log('No windows.jsonl records yet.');
    return;
  }

  let checked = 0;
  let resolved = 0;
  const nowSec = Math.floor(Date.now() / 1000);

  for (const rec of rows) {
    if (rec.resolved) continue;
    // window end = slug ts + tf seconds; add ~3 min buffer for settlement
    const tfSec = market.TF_SECONDS[rec.tf] || 900;
    const startSec = parseInt(String(rec.slug).split('-').pop(), 10);
    if (!Number.isFinite(startSec)) continue;
    const settleSec = startSec + tfSec + 180;
    if (nowSec < settleSec) continue; // too soon

    checked++;
    const m = await market.getMarketPrices(rec.slug);
    if (!m || !m.closed) continue;
    if (m.upPrice == null || m.downPrice == null) continue;

    const winner = m.upPrice > 0.9 ? 'UP' : m.downPrice > 0.9 ? 'DOWN' : null;
    if (!winner) continue;

    rec.resolved = true;
    rec.winner = winner;
    if (rec.decision !== 'NO_BET' && rec.side) {
      rec.outcome = rec.side === winner ? 'WIN' : 'LOSS';
      rec.paperPnl = paperPnl(rec, winner);
    } else {
      rec.outcome = 'NA';
      rec.paperPnl = 0;
    }
    resolved++;
    if (verbose) {
      console.log(
        `  ${rec.slug} -> ${winner} | pUp=${rec.pUp} | ${rec.decision}${rec.side ? ' ' + rec.side : ''} => ${rec.outcome} (${rec.paperPnl >= 0 ? '+' : ''}${rec.paperPnl})`
      );
    }
  }

  fs.writeFileSync(WINDOWS_FILE, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(`✅ resolve-windows: checked ${checked}, newly resolved ${resolved}, total ${rows.length}`);
}

main().catch((e) => {
  console.error('❌ resolve-windows error:', e.message);
  process.exit(1);
});
