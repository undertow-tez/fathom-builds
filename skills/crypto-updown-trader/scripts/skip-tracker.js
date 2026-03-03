#!/usr/bin/env node
/**
 * Skip Tracker — logs every skipped window's hypothetical outcome
 * 
 * Run AFTER each window resolves to check: "if we had bet, would we have won?"
 * Appends to skips.jsonl for later analysis.
 * 
 * Usage: node skip-tracker.js
 *   --check    Check recent skips against resolved outcomes
 *   --analyze  Show skip analysis (win rates, patterns)
 */

const fs = require('fs');
const https = require('https');
const path = require('path');

const SKIPS_FILE = path.join(__dirname, 'skips.jsonl');
const BETS_FILE = path.join(__dirname, 'bets.jsonl');
const TRADE_LOG = path.join(__dirname, 'trade-log.json');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'fathom-bot/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(`JSON parse: ${data.slice(0,200)}`)); }
      });
    }).on('error', reject);
  });
}

// Log a skip event (called by cycle.sh when NO_BET)
function logSkip(data) {
  const entry = {
    time: new Date().toISOString(),
    price: data.price,
    score: data.score,
    rsi: data.rsi,
    volatility: data.volatility,
    ma_alignment: data.ma_alignment, // 'bullish', 'bearish', 'mixed'
    dir5: data.dir5,
    reasons: data.reasons || [],
    hypothetical_up: null,  // filled in later
    hypothetical_down: null,
    actual_result: null,    // UP_WON or DOWN_WON
    checked: false
  };
  fs.appendFileSync(SKIPS_FILE, JSON.stringify(entry) + '\n');
  return entry;
}

// Check resolved outcomes for unchecked skips
async function checkSkips() {
  if (!fs.existsSync(SKIPS_FILE)) {
    console.log('No skips logged yet.');
    return;
  }
  
  const lines = fs.readFileSync(SKIPS_FILE, 'utf8').trim().split('\n').filter(Boolean);
  const skips = lines.map(l => JSON.parse(l));
  let updated = 0;
  
  for (let i = 0; i < skips.length; i++) {
    if (skips[i].checked) continue;
    
    const skipTime = new Date(skips[i].time);
    const now = new Date();
    const ageMinutes = (now - skipTime) / 60000;
    
    // Only check skips that are old enough to have resolved (>20 min)
    if (ageMinutes < 20) continue;
    
    // Determine the window this skip was in
    const et = new Date(skipTime.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const windowMin = Math.floor(et.getMinutes() / 15) * 15;
    const windowStart = new Date(et);
    windowStart.setMinutes(windowMin, 0, 0);
    const windowTs = Math.floor(windowStart.getTime() / 1000);
    
    // Check Polymarket for resolution
    const slug = `btc-updown-15m-${windowTs}`;
    try {
      const data = await fetchJSON(`https://gamma-api.polymarket.com/markets?slug=${slug}`);
      if (data && data[0]) {
        const market = data[0];
        if (market.closed || market.resolved) {
          // Determine outcome
          const outcomeStr = (market.outcomePrices || market.outcomes || '').toString().toLowerCase();
          let result = 'UNKNOWN';
          
          if (market.resolvedOutcome === 'Up' || market.resolvedOutcome === 'up') {
            result = 'UP_WON';
          } else if (market.resolvedOutcome === 'Down' || market.resolvedOutcome === 'down') {
            result = 'DOWN_WON';
          } else if (market.resolved) {
            // Try to infer from outcome prices
            try {
              const prices = JSON.parse(market.outcomePrices);
              if (prices[0] > 0.9) result = 'UP_WON';
              else if (prices[1] > 0.9) result = 'DOWN_WON';
            } catch {}
          }
          
          if (result !== 'UNKNOWN') {
            skips[i].actual_result = result;
            skips[i].hypothetical_up = result === 'UP_WON' ? 'WIN' : 'LOSS';
            skips[i].hypothetical_down = result === 'DOWN_WON' ? 'WIN' : 'LOSS';
            skips[i].checked = true;
            updated++;
          }
        }
      }
    } catch (e) {
      // API error, skip for now
    }
  }
  
  // Write back
  fs.writeFileSync(SKIPS_FILE, skips.map(s => JSON.stringify(s)).join('\n') + '\n');
  console.log(`Checked ${updated} skips, ${skips.filter(s => !s.checked).length} still pending.`);
  return skips;
}

// Analyze skip data
function analyze() {
  if (!fs.existsSync(SKIPS_FILE)) {
    console.log('No skips logged yet.');
    return;
  }
  
  const lines = fs.readFileSync(SKIPS_FILE, 'utf8').trim().split('\n').filter(Boolean);
  const skips = lines.map(l => JSON.parse(l));
  const checked = skips.filter(s => s.checked);
  const unchecked = skips.filter(s => !s.checked);
  
  if (checked.length === 0) {
    console.log(`${skips.length} skips logged, none resolved yet.`);
    return;
  }
  
  const upWins = checked.filter(s => s.hypothetical_up === 'WIN').length;
  const downWins = checked.filter(s => s.hypothetical_down === 'WIN').length;
  
  console.log('=== SKIP ANALYSIS ===');
  console.log(`Total skips: ${skips.length} (${checked.length} resolved, ${unchecked.length} pending)`);
  console.log(`If we had bet UP on all skips: ${upWins}/${checked.length} wins (${(upWins/checked.length*100).toFixed(1)}%)`);
  console.log(`If we had bet DOWN on all skips: ${downWins}/${checked.length} wins (${(downWins/checked.length*100).toFixed(1)}%)`);
  console.log('');
  
  // Breakdown by score range
  const ranges = [
    { label: 'score 0-0.9 (very weak)', min: -0.9, max: 0.9 },
    { label: 'score 1-1.9 (near threshold)', min: 1, max: 1.9 },
    { label: 'score -1 to -1.9 (weak DOWN filtered)', min: -1.9, max: -1 },
    { label: 'score ≤-2 (DOWN filtered by UP-only)', min: -10, max: -2 },
  ];
  
  for (const range of ranges) {
    const subset = checked.filter(s => {
      const sc = parseFloat(s.score);
      return sc >= range.min && sc <= range.max;
    });
    if (subset.length === 0) continue;
    const subUpWins = subset.filter(s => s.hypothetical_up === 'WIN').length;
    console.log(`  ${range.label}: ${subset.length} skips, UP would've won ${subUpWins}/${subset.length} (${(subUpWins/subset.length*100).toFixed(1)}%)`);
  }
  
  // Recent pattern (last 10)
  console.log('\n--- Last 10 skips ---');
  const recent = checked.slice(-10);
  for (const s of recent) {
    const time = new Date(s.time).toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' });
    console.log(`  ${time} | score ${s.score} | ${s.actual_result} | UP=${s.hypothetical_up} | RSI ${s.rsi} | ${s.ma_alignment}`);
  }
  
  console.log('\n__ANALYSIS_COMPLETE__');
}

// Main
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--check')) {
    await checkSkips();
  } else if (args.includes('--analyze')) {
    analyze();
  } else if (args.includes('--log')) {
    // Log a skip from stdin or args
    const data = {
      price: parseFloat(args[args.indexOf('--price') + 1] || 0),
      score: parseFloat(args[args.indexOf('--score') + 1] || 0),
      rsi: parseFloat(args[args.indexOf('--rsi') + 1] || 0),
      volatility: args[args.indexOf('--vol') + 1] || '0',
      ma_alignment: args[args.indexOf('--ma') + 1] || 'unknown',
      dir5: args[args.indexOf('--dir5') + 1] || '',
      reasons: [],
    };
    const entry = logSkip(data);
    console.log(`Logged skip: score ${data.score}, price $${data.price}`);
  } else {
    console.log('Usage: node skip-tracker.js --log --price X --score X --rsi X --vol X --ma bullish|bearish|mixed');
    console.log('       node skip-tracker.js --check   (resolve pending skips)');
    console.log('       node skip-tracker.js --analyze (show insights)');
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
