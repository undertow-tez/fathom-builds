#!/usr/bin/env node
/**
 * P&L report from bets.jsonl — real accounting from redeem entries.
 *
 * Payout priority per won bet:
 *   1. `payout` captured from the Bankr redeem confirmation (actual)
 *   2. `shares` captured from the buy confirmation (winning share = $1.00)
 *   3. Estimate: amount / entryPrice (falls back to amount * 1.9 if no price)
 *
 * Usage:
 *   node pnl.js               All-time, per-strategy
 *   node pnl.js --today       Today (UTC) only
 *   node pnl.js --json        Machine-readable output (used by cycle guards)
 */

const fs = require('fs');
const path = require('path');

const BETS_FILE = path.join(__dirname, 'bets.jsonl');
const args = process.argv.slice(2);
const todayOnly = args.includes('--today');
const asJson = args.includes('--json');
const today = new Date().toISOString().slice(0, 10);

function loadLines() {
  try {
    return fs.readFileSync(BETS_FILE, 'utf8').split('\n').filter(Boolean).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

const lines = loadLines();
const bets = {};   // slug -> submitted entry
for (const d of lines) {
  if (d.result === 'submitted' && d.slug) bets[d.slug] = d;
}

const stats = {}; // strategy -> {wins, losses, wagered, returned}
function bucket(strategy) {
  if (!stats[strategy]) stats[strategy] = { wins: 0, losses: 0, wagered: 0, returned: 0, pending: 0 };
  return stats[strategy];
}

const redeemedSlugs = new Set();
for (const d of lines) {
  if (d.action !== 'redeem' || !d.slug) continue;
  if (todayOnly && !String(d.time || '').startsWith(today)) continue;
  redeemedSlugs.add(d.slug);
  const bet = bets[d.slug] || {};
  const strategy = d.strategy || bet.strategy || '?';
  const s = bucket(strategy);
  const amount = parseFloat(d.amount || bet.amount || 0) || 0;
  s.wagered += amount;
  if (String(d.result || '').includes('WON')) {
    s.wins++;
    let payout;
    if (d.payout) payout = parseFloat(d.payout);
    else if (bet.shares) payout = parseFloat(bet.shares);
    else if (bet.price && parseFloat(bet.price) > 0) payout = amount / parseFloat(bet.price);
    else payout = amount * 1.9;
    s.returned += payout;
  } else {
    s.losses++;
  }
}

// Pending (submitted, not yet redeemed)
for (const [slug, bet] of Object.entries(bets)) {
  if (redeemedSlugs.has(slug)) continue;
  if (todayOnly && !String(bet.time || '').startsWith(today)) continue;
  bucket(bet.strategy || '?').pending++;
}

let totalNet = 0, totalWins = 0, totalLosses = 0, totalWagered = 0;
const report = {};
for (const [strategy, s] of Object.entries(stats)) {
  const net = s.returned - s.wagered;
  totalNet += net; totalWins += s.wins; totalLosses += s.losses; totalWagered += s.wagered;
  report[strategy] = {
    wins: s.wins, losses: s.losses, pending: s.pending,
    winRate: (s.wins + s.losses) ? +(100 * s.wins / (s.wins + s.losses)).toFixed(1) : null,
    wagered: +s.wagered.toFixed(2),
    returned: +s.returned.toFixed(2),
    net: +net.toFixed(2),
  };
}

const summary = {
  period: todayOnly ? today : 'all-time',
  strategies: report,
  totals: {
    wins: totalWins, losses: totalLosses,
    winRate: (totalWins + totalLosses) ? +(100 * totalWins / (totalWins + totalLosses)).toFixed(1) : null,
    wagered: +totalWagered.toFixed(2),
    net: +totalNet.toFixed(2),
  },
};

if (asJson) {
  console.log(JSON.stringify(summary));
} else {
  console.log(`📊 P&L (${summary.period})`);
  for (const [strategy, r] of Object.entries(report)) {
    console.log(`  ${strategy}: ${r.wins}W/${r.losses}L (${r.winRate ?? '—'}% WR), wagered $${r.wagered}, net ${r.net >= 0 ? '+' : ''}$${r.net}${r.pending ? `, ${r.pending} pending` : ''}`);
  }
  const t = summary.totals;
  console.log(`  ─────`);
  console.log(`  Net profit: ${t.net >= 0 ? '+' : ''}$${t.net} (${t.wins}W/${t.losses}L, $${t.wagered} wagered)`);
}
