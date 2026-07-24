#!/usr/bin/env node
'use strict';
/**
 * backtest.js — did the edge actually exist?
 *
 * Reads resolved records from windows.jsonl and reports the only things that
 * matter for deciding whether to risk real money:
 *
 *   1. CALIBRATION — across ALL resolved windows, does model P(up) match the
 *      actual UP frequency? If P(up)=70% windows go up ~70% of the time, the
 *      model is trustworthy. If not, the "edges" are model error, not alpha.
 *   2. PAPER P&L — for the windows we would have bet, realized profit net of
 *      the price paid. Positive and stable => the edge is real.
 *   3. EDGE BUCKETS — do bigger predicted edges actually pay more? (They
 *      should. If small edges pay and big edges lose, the model is miscalibrated
 *      at the extremes — usually a strike/vol mismatch.)
 *
 * Usage: node backtest.js [--all]   (--all also prints side/asset/time splits)
 */
const fs = require('fs');
const path = require('path');

const WINDOWS_FILE = path.join(__dirname, 'windows.jsonl');
const showAll = process.argv.includes('--all');

function read() {
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

function pct(x) {
  return (x * 100).toFixed(1) + '%';
}
function bar(x, width = 20) {
  return '█'.repeat(Math.max(0, Math.round(x * width)));
}

function calibration(resolved) {
  // Only windows where the model produced a probability and a real outcome.
  const rows = resolved.filter((r) => r.pUp != null && (r.winner === 'UP' || r.winner === 'DOWN'));
  if (!rows.length) return;
  const bins = [];
  for (let b = 0; b < 10; b++) bins.push({ lo: b / 10, hi: (b + 1) / 10, n: 0, up: 0, sumP: 0 });
  for (const r of rows) {
    let idx = Math.min(9, Math.floor(r.pUp * 10));
    bins[idx].n++;
    bins[idx].sumP += r.pUp;
    if (r.winner === 'UP') bins[idx].up++;
  }
  console.log('\n📐 Model calibration (all resolved windows)');
  console.log('   predicted P(up) → actual UP frequency');
  console.log('   ' + '─'.repeat(52));
  let brierSum = 0;
  for (const r of rows) {
    const y = r.winner === 'UP' ? 1 : 0;
    brierSum += (r.pUp - y) ** 2;
  }
  for (const b of bins) {
    if (!b.n) continue;
    const predMean = b.sumP / b.n;
    const actual = b.up / b.n;
    console.log(
      `   ${(b.lo * 100).toFixed(0).padStart(3)}-${(b.hi * 100).toFixed(0).padEnd(3)}%  pred ${pct(predMean).padStart(6)}  actual ${pct(actual).padStart(6)}  (n=${b.n}) ${bar(actual)}`
    );
  }
  const brier = brierSum / rows.length;
  console.log(`   Brier score: ${brier.toFixed(4)}  (0=perfect, 0.25=coin-flip; lower is better)`);
  return brier;
}

function paperResults(resolved, label, subset) {
  const bets = subset.filter((r) => r.decision !== 'NO_BET' && r.outcome && r.outcome !== 'NA');
  if (!bets.length) {
    console.log(`\n💵 ${label}: no resolved paper bets yet`);
    return;
  }
  const wins = bets.filter((b) => b.outcome === 'WIN').length;
  const staked = bets.reduce((a, b) => a + (b.size || 0), 0);
  const pnl = bets.reduce((a, b) => a + (b.paperPnl || 0), 0);
  const predEvDollars = bets.reduce((a, b) => a + (b.ev || 0) * (b.size || 0), 0);
  console.log(`\n💵 ${label} (paper)`);
  console.log('   ' + '─'.repeat(52));
  console.log(`   bets: ${bets.length} | win rate: ${pct(wins / bets.length)} (${wins}W/${bets.length - wins}L)`);
  console.log(`   staked: $${staked.toFixed(2)} | realized P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} | ROI: ${pct(pnl / staked)}`);
  console.log(`   predicted EV: ${predEvDollars >= 0 ? '+' : ''}$${predEvDollars.toFixed(2)} vs realized ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`);
  console.log(`   avg P&L/bet: ${pnl / bets.length >= 0 ? '+' : ''}$${(pnl / bets.length).toFixed(3)}`);
}

function edgeBuckets(resolved) {
  const bets = resolved.filter((r) => r.decision !== 'NO_BET' && r.outcome && r.outcome !== 'NA' && r.edge != null);
  if (!bets.length) return;
  const buckets = [
    { label: '4-7pp ', min: 0.04, max: 0.07 },
    { label: '7-12pp', min: 0.07, max: 0.12 },
    { label: '12pp+ ', min: 0.12, max: 1 },
  ];
  console.log('\n🎯 Realized performance by predicted edge');
  console.log('   ' + '─'.repeat(52));
  for (const bk of buckets) {
    const sub = bets.filter((b) => b.edge >= bk.min && b.edge < bk.max);
    if (!sub.length) continue;
    const wins = sub.filter((b) => b.outcome === 'WIN').length;
    const pnl = sub.reduce((a, b) => a + (b.paperPnl || 0), 0);
    const staked = sub.reduce((a, b) => a + (b.size || 0), 0);
    console.log(`   ${bk.label}: n=${sub.length} winRate ${pct(wins / sub.length)} ROI ${pct(pnl / staked)} P&L ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`);
  }
}

function split(resolved, key, label) {
  const bets = resolved.filter((r) => r.decision !== 'NO_BET' && r.outcome && r.outcome !== 'NA');
  const groups = {};
  for (const b of bets) {
    const k = typeof key === 'function' ? key(b) : b[key];
    (groups[k] = groups[k] || []).push(b);
  }
  console.log(`\n📊 By ${label}`);
  console.log('   ' + '─'.repeat(52));
  for (const [k, sub] of Object.entries(groups)) {
    const wins = sub.filter((b) => b.outcome === 'WIN').length;
    const pnl = sub.reduce((a, b) => a + (b.paperPnl || 0), 0);
    const staked = sub.reduce((a, b) => a + (b.size || 0), 0);
    console.log(`   ${String(k).padEnd(8)}: n=${sub.length} winRate ${pct(wins / sub.length)} ROI ${pct(pnl / (staked || 1))} P&L ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`);
  }
}

function main() {
  const rows = read();
  const resolved = rows.filter((r) => r.resolved);
  const bets = rows.filter((r) => r.decision !== 'NO_BET');
  console.log('\n' + '═'.repeat(56));
  console.log(`  BACKTEST — ${rows.length} windows logged, ${resolved.length} resolved`);
  console.log(`  would-bet windows: ${bets.length} (${rows.length ? pct(bets.length / rows.length) : '0%'} selectivity)`);
  console.log('═'.repeat(56));

  if (!resolved.length) {
    console.log('\n⏳ Nothing resolved yet. Let the machine run in shadow mode, then:');
    console.log('   node resolve-windows.js && node backtest.js');
    return;
  }

  calibration(resolved);
  paperResults(resolved, 'All paper bets', resolved);
  edgeBuckets(resolved);

  if (showAll) {
    split(resolved, 'side', 'side');
    split(resolved, 'asset', 'asset');
    split(resolved, (b) => (b.minutesLeft >= 7 ? '≥7m left' : '<7m left'), 'time-left');
  }

  console.log('\n📌 Decision rule of thumb:');
  console.log('   Go live only when calibration is tight (Brier < ~0.24) AND');
  console.log('   paper ROI is positive over 100+ resolved bets across sessions.');
  console.log('');
}

main();
