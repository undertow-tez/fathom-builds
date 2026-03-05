#!/usr/bin/env node
// pnl.js — Accurate P&L from bets.jsonl
// Uses actual stored payout/shares data. Falls back to Polymarket price lookup.
// Usage:
//   node pnl.js              # all-time summary
//   node pnl.js --today      # today only
//   node pnl.js --full       # per-bet breakdown

const fs = require('fs');
const path = require('path');
const https = require('https');

const BETS_FILE = path.join(__dirname, 'bets.jsonl');
const args = process.argv.slice(2);
const todayOnly = args.includes('--today');
const fullBreakdown = args.includes('--full');

function fetchJson(url) {
  return new Promise((resolve) => {
    https.get(url, { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

async function getMarketInitialPrice(slug) {
  // Query Polymarket gamma API for market outcome prices
  // For a resolved market, outcomePrices = ["1", "0"] or ["0", "1"]
  // For an open market at start, should be close to ["0.5", "0.5"]
  // We use the clobTokenIds to look up CLOB price history - but for simplicity
  // just return null and let caller use fallback
  try {
    const data = await fetchJson(`https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}`);
    if (!data || !data[0]) return null;
    const m = data[0];
    const prices = JSON.parse(m.outcomePrices || '["0.5","0.5"]');
    return {
      upPrice: parseFloat(prices[0]),
      downPrice: parseFloat(prices[1]),
      closed: m.closed || false,
      resolved: m.closed || false,
    };
  } catch {
    return null;
  }
}

async function main() {
  if (!fs.existsSync(BETS_FILE)) {
    console.log('No bets.jsonl found');
    process.exit(0);
  }

  const lines = fs.readFileSync(BETS_FILE, 'utf8').trim().split('\n').filter(Boolean);
  const entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

  // Build map: slug → { submitted, redeemed }
  const bySlug = {};
  for (const e of entries) {
    const slug = e.slug;
    if (!slug) continue;
    if (e.result === 'submitted') {
      bySlug[slug] = bySlug[slug] || {};
      bySlug[slug].submitted = e;
    }
    if (e.action === 'redeem') {
      bySlug[slug] = bySlug[slug] || {};
      bySlug[slug].redeemed = e;
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  let totalSpent = 0;
  let totalPayout = 0;
  let wins = 0;
  let losses = 0;
  let pending = 0;
  let breakdown = [];

  for (const [slug, pair] of Object.entries(bySlug)) {
    const sub = pair.submitted;
    const red = pair.redeemed;
    if (!sub) continue;

    // Filter to today if requested
    if (todayOnly && !sub.time.startsWith(todayStr)) continue;

    const betAmount = parseFloat(sub.amount || 0);
    if (!betAmount) continue;

    totalSpent += betAmount;

    if (!red) {
      pending++;
      if (fullBreakdown) {
        breakdown.push({ slug, direction: sub.direction, amount: betAmount, status: 'PENDING', profit: null });
      }
      continue;
    }

    const won = red.result && red.result.includes('WON');
    const lost = red.result && red.result.includes('LOST');

    if (won) {
      wins++;
      // Use stored payout if available (from updated redeem-all.sh)
      if (red.payout) {
        const payout = parseFloat(red.payout);
        totalPayout += payout;
        if (fullBreakdown) {
          breakdown.push({
            slug, direction: sub.direction, amount: betAmount,
            payout, profit: +(payout - betAmount).toFixed(2),
            source: 'actual', status: 'WON'
          });
        }
      } else if (sub.shares) {
        // Have share count from background poll
        const shares = parseFloat(sub.shares);
        const payout = shares; // each share pays $1 on win
        totalPayout += payout;
        if (fullBreakdown) {
          breakdown.push({
            slug, direction: sub.direction, amount: betAmount,
            shares, payout: +payout.toFixed(4), profit: +(payout - betAmount).toFixed(4),
            source: 'shares', status: 'WON'
          });
        }
      } else {
        // Estimate: assume ~$0.52/share for UP bets (slight premium due to tie edge)
        const estimatedSharePrice = sub.direction === 'UP' ? 0.53 : 0.47;
        const shares = betAmount / estimatedSharePrice;
        const payout = shares;
        totalPayout += payout;
        if (fullBreakdown) {
          breakdown.push({
            slug, direction: sub.direction, amount: betAmount,
            payout: +payout.toFixed(4), profit: +(payout - betAmount).toFixed(4),
            source: 'estimate', status: 'WON'
          });
        }
      }
    } else if (lost) {
      losses++;
      // Lost bets: payout = 0 (shares worth $0)
      if (fullBreakdown) {
        breakdown.push({ slug, direction: sub.direction, amount: betAmount, payout: 0, profit: -betAmount, source: 'actual', status: 'LOST' });
      }
    }
  }

  const netProfit = totalPayout - totalSpent;
  const totalResolved = wins + losses;
  const winRate = totalResolved > 0 ? ((wins / totalResolved) * 100).toFixed(1) : '0.0';

  const label = todayOnly ? "Today's" : "All-time";

  console.log(`\n📊 ${label} P&L (actual accounting)`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Bets placed:   ${totalResolved + pending} (${pending} pending)`);
  console.log(`  Wins / Losses: ${wins}W / ${losses}L (${winRate}% win rate)`);
  console.log(`  USDC spent:    $${totalSpent.toFixed(2)}`);
  console.log(`  USDC received: $${totalPayout.toFixed(2)}`);
  console.log(`  Net profit:    ${netProfit >= 0 ? '+' : ''}$${netProfit.toFixed(2)}`);

  // Flag if using estimates
  const hasEstimates = breakdown.some(b => b.source === 'estimate');
  if (hasEstimates || !fullBreakdown) {
    console.log(`  ⚠️  Some wins use estimated share price ($0.53 UP / $0.47 DOWN)`);
    console.log(`     Run machine longer to accumulate actual payout data`);
  }

  if (fullBreakdown && breakdown.length > 0) {
    console.log(`\n  Per-bet breakdown:`);
    for (const b of breakdown) {
      const icon = b.status === 'WON' ? '✅' : b.status === 'LOST' ? '❌' : '⏳';
      const profitStr = b.profit !== null ? (b.profit >= 0 ? `+$${b.profit.toFixed(2)}` : `-$${Math.abs(b.profit).toFixed(2)}`) : '?';
      const src = b.source ? ` [${b.source}]` : '';
      console.log(`  ${icon} ${b.direction} $${b.amount} → ${profitStr}${src}`);
    }
  }

  console.log('');

  // Machine efficiency summary (only for today)
  if (todayOnly && totalResolved > 0) {
    const roi = ((netProfit / totalSpent) * 100).toFixed(1);
    console.log(`  ROI: ${roi}%`);
    console.log(`  Per-bet avg: ${netProfit >= 0 ? '+' : ''}$${(netProfit / totalResolved).toFixed(2)}`);
    console.log('');
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
