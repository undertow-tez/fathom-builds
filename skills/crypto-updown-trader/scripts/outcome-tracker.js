#!/usr/bin/env node
/**
 * Outcome Tracker — closes the loop on bet results
 * 
 * Reads trade-log.json, checks resolution for unresolved bets,
 * updates win/loss, and outputs performance analytics.
 * 
 * Usage:
 *   node outcome-tracker.js              # Update all unresolved bets
 *   node outcome-tracker.js --stats      # Show performance breakdown
 *   node outcome-tracker.js --by-score   # Win rate by score bucket
 *   node outcome-tracker.js --by-hour    # Win rate by hour of day
 *   node outcome-tracker.js --by-asset   # Win rate by asset
 *   node outcome-tracker.js --sigma      # Output metrics for six-sigma
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const LOG_FILE = __dirname + '/trade-log.json';
const SIGMA_DIR = path.join(__dirname, '..', 'six-sigma-projects', 'crypto-updown-trader');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : require('http');
    mod.get(url, { headers: { 'User-Agent': 'fathom-bot/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(`Parse error: ${data.slice(0,200)}`)); }
      });
    }).on('error', reject);
  });
}

function getSlugTimestamp(timestamp, asset = 'btc', timeframe = '15m') {
  const d = new Date(timestamp);
  // Convert to ET
  const etOffset = -5 * 60; // EST (simplified)
  const utcMs = d.getTime();
  const etMs = utcMs + etOffset * 60 * 1000;
  const etDate = new Date(etMs);
  
  const tfMinutes = timeframe === '5m' ? 5 : 15;
  const windowMin = Math.floor(etDate.getMinutes() / tfMinutes) * tfMinutes;
  const windowStart = new Date(etDate);
  windowStart.setMinutes(windowMin, 0, 0);
  
  // Convert back to UTC epoch
  const windowUtcMs = windowStart.getTime() - etOffset * 60 * 1000;
  return Math.floor(windowUtcMs / 1000);
}

async function checkResolution(slug) {
  try {
    const data = await fetchJSON(`https://gamma-api.polymarket.com/markets?slug=${slug}`);
    if (!data || !data.length) return null;
    const m = data[0];
    if (!m.closed) return { resolved: false };
    
    const prices = JSON.parse(m.outcomePrices || '[]');
    const upWon = prices[0] === '1' || parseFloat(prices[0]) > 0.99;
    return { resolved: true, winner: upWon ? 'UP' : 'DOWN', title: m.question };
  } catch { return null; }
}

async function updateOutcomes() {
  let log = [];
  try { log = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); } catch { return; }
  
  let updated = 0;
  for (const entry of log) {
    if (entry.decision === 'NO_BET') continue;
    if (entry.resolved) continue;
    
    const asset = entry.asset || 'btc';
    const tf = entry.timeframe || '15m';
    const ts = getSlugTimestamp(entry.timestamp, asset, tf);
    const slug = `${asset}-updown-${tf}-${ts}`;
    
    const result = await checkResolution(slug);
    if (!result || !result.resolved) continue;
    
    const betDirection = entry.decision === 'BET_UP' ? 'UP' : 'DOWN';
    entry.resolved = true;
    entry.result = betDirection === result.winner ? 'WIN' : 'LOSS';
    entry.winner = result.winner;
    entry.slug = slug;
    updated++;
  }
  
  if (updated > 0) {
    fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
    console.log(`✅ Updated ${updated} bet outcomes`);
  } else {
    console.log('No unresolved bets to update');
  }
  
  return log;
}

function computeStats(log, filter = {}) {
  let bets = log.filter(l => l.decision !== 'NO_BET');
  
  if (filter.asset) bets = bets.filter(b => (b.asset || 'btc') === filter.asset);
  if (filter.resolved) bets = bets.filter(b => b.resolved);
  
  const resolved = bets.filter(b => b.resolved);
  const wins = resolved.filter(b => b.result === 'WIN');
  const losses = resolved.filter(b => b.result === 'LOSS');
  
  const totalWagered = resolved.reduce((a, b) => a + (b.betSize || 3), 0);
  const totalReturned = wins.length * 2 * (totalWagered / resolved.length || 0);
  
  return {
    totalBets: bets.length,
    resolved: resolved.length,
    unresolved: bets.length - resolved.length,
    wins: wins.length,
    losses: losses.length,
    winRate: resolved.length > 0 ? (wins.length / resolved.length * 100).toFixed(1) + '%' : 'N/A',
    totalWagered: totalWagered.toFixed(2),
    estimatedPnL: ((wins.length * 2 - resolved.length) * (totalWagered / resolved.length || 3)).toFixed(2),
    skipped: log.filter(l => l.decision === 'NO_BET').length,
    selectivity: bets.length > 0 ? (bets.length / log.length * 100).toFixed(1) + '%' : 'N/A',
  };
}

function byScoreBucket(log) {
  const bets = log.filter(l => l.decision !== 'NO_BET' && l.resolved);
  const buckets = {};
  
  for (const b of bets) {
    const absScore = Math.abs(b.score || 0);
    const bucket = absScore >= 4 ? '4+' : absScore >= 3 ? '3-4' : '2-3';
    if (!buckets[bucket]) buckets[bucket] = { total: 0, wins: 0 };
    buckets[bucket].total++;
    if (b.result === 'WIN') buckets[bucket].wins++;
  }
  
  console.log('\n📊 Win Rate by Score Bucket:');
  console.log('─'.repeat(40));
  for (const [bucket, data] of Object.entries(buckets).sort()) {
    const rate = (data.wins / data.total * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(data.wins / data.total * 20));
    console.log(`  Score ${bucket}: ${rate}% (${data.wins}/${data.total}) ${bar}`);
  }
}

function byHour(log) {
  const bets = log.filter(l => l.decision !== 'NO_BET' && l.resolved);
  const hours = {};
  
  for (const b of bets) {
    const d = new Date(b.timestamp);
    const etHour = (d.getUTCHours() - 5 + 24) % 24;
    const h = `${etHour}:00`;
    if (!hours[h]) hours[h] = { total: 0, wins: 0 };
    hours[h].total++;
    if (b.result === 'WIN') hours[h].wins++;
  }
  
  console.log('\n🕐 Win Rate by Hour (ET):');
  console.log('─'.repeat(40));
  for (const [hour, data] of Object.entries(hours).sort()) {
    const rate = (data.wins / data.total * 100).toFixed(1);
    console.log(`  ${hour.padStart(5)}: ${rate}% (${data.wins}/${data.total})`);
  }
}

function byAsset(log) {
  const bets = log.filter(l => l.decision !== 'NO_BET' && l.resolved);
  const assets = {};
  
  for (const b of bets) {
    const a = b.asset || 'btc';
    if (!assets[a]) assets[a] = { total: 0, wins: 0 };
    assets[a].total++;
    if (b.result === 'WIN') assets[a].wins++;
  }
  
  console.log('\n💰 Win Rate by Asset:');
  console.log('─'.repeat(40));
  for (const [asset, data] of Object.entries(assets)) {
    const rate = (data.wins / data.total * 100).toFixed(1);
    console.log(`  ${asset.toUpperCase()}: ${rate}% (${data.wins}/${data.total})`);
  }
}

function byDirection(log) {
  const bets = log.filter(l => l.decision !== 'NO_BET' && l.resolved);
  const dirs = { UP: { total: 0, wins: 0 }, DOWN: { total: 0, wins: 0 } };
  
  for (const b of bets) {
    const d = b.decision === 'BET_UP' ? 'UP' : 'DOWN';
    dirs[d].total++;
    if (b.result === 'WIN') dirs[d].wins++;
  }
  
  console.log('\n↕️ Win Rate by Direction:');
  console.log('─'.repeat(40));
  for (const [dir, data] of Object.entries(dirs)) {
    if (data.total === 0) continue;
    const rate = (data.wins / data.total * 100).toFixed(1);
    console.log(`  ${dir}: ${rate}% (${data.wins}/${data.total})`);
  }
}

async function outputSigmaMetrics(log) {
  const stats = computeStats(log, { resolved: true });
  const measureScript = path.join(__dirname, '..', 'six-sigma-projects', 'crypto-updown-trader', 'measurements.jsonl');
  
  const metrics = [
    { metric: 'win_rate', value: parseFloat(stats.winRate) || 0 },
    { metric: 'selectivity', value: parseFloat(stats.selectivity) || 0 },
    { metric: 'total_bets', value: stats.resolved },
    { metric: 'pnl', value: parseFloat(stats.estimatedPnL) || 0 },
  ];
  
  const timestamp = new Date().toISOString();
  for (const m of metrics) {
    const line = JSON.stringify({ ...m, timestamp }) + '\n';
    fs.appendFileSync(measureScript, line);
  }
  
  console.log(`\n📏 Six Sigma metrics logged to ${measureScript}`);
  console.log(JSON.stringify(metrics, null, 2));
}

async function main() {
  const args = process.argv.slice(2);
  
  // Always update outcomes first
  const log = await updateOutcomes();
  if (!log) { console.error('No trade log found'); return; }
  
  if (args.includes('--stats')) {
    const stats = computeStats(log, { resolved: true });
    console.log('\n📊 Overall Performance:');
    console.log('─'.repeat(40));
    console.log(JSON.stringify(stats, null, 2));
  }
  
  if (args.includes('--by-score')) byScoreBucket(log);
  if (args.includes('--by-hour')) byHour(log);
  if (args.includes('--by-asset')) byAsset(log);
  if (args.includes('--by-direction')) byDirection(log);
  if (args.includes('--sigma')) await outputSigmaMetrics(log);
  
  // Default: show summary if no flags
  if (args.length === 0) {
    const stats = computeStats(log);
    console.log(`\n📊 ${stats.resolved} resolved / ${stats.unresolved} pending | Win rate: ${stats.winRate} | PnL: $${stats.estimatedPnL}`);
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
