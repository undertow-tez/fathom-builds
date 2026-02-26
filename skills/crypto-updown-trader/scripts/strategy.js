#!/usr/bin/env node
/**
 * BTC Up/Down 5-Minute Polymarket Strategy
 * 
 * Analyzes short-term BTC momentum and outputs a signal:
 *   BET_UP, BET_DOWN, or NO_BET (when edge is insufficient)
 * 
 * Edges exploited:
 *   1. Ties resolve UP (structural edge for UP in low-vol periods)
 *   2. Short-term momentum (trend continuation > reversal on 5min)
 *   3. Only bet when indicators align (selective, not every 5 min)
 * 
 * Usage: node strategy.js [--dry-run] [--bet-size 3]
 */

const https = require('https');
const fs = require('fs');

const LOG_FILE = __dirname + '/trade-log.json';
const BET_SIZE_DEFAULT = 3; // USD

// --- Fetch helpers ---
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : require('http');
    mod.get(url, { headers: { 'User-Agent': 'fathom-bot/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(`JSON parse failed: ${data.slice(0,200)}`)); }
      });
    }).on('error', reject);
  });
}

// --- Get 1-min candles from Binance US ---
async function getCandles(limit = 60) {
  const data = await fetchJSON(`https://api.binance.us/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=${limit}`);
  return data.map(c => ({
    time: c[0],
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5]),
  }));
}

// --- Indicators ---
function calcMA(prices, period) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calcRSI(prices, period = 14) {
  if (prices.length < period + 1) return 50; // neutral default
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - (100 / (1 + rs));
}

function calcVolatility(candles, period = 10) {
  const returns = [];
  for (let i = candles.length - period; i < candles.length; i++) {
    returns.push((candles[i].close - candles[i].open) / candles[i].open);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance);
}

function consecutiveDirection(candles, lookback = 5) {
  const recent = candles.slice(-lookback);
  let ups = 0, downs = 0;
  for (const c of recent) {
    if (c.close >= c.open) ups++;
    else downs++;
  }
  return { ups, downs, streak: ups > downs ? 'UP' : 'DOWN', strength: Math.max(ups, downs) / lookback };
}

// --- Strategy ---
function analyzeAndDecide(candles) {
  const closes = candles.map(c => c.close);
  const currentPrice = closes[closes.length - 1];
  
  // Moving averages
  const ma5 = calcMA(closes, 5);
  const ma10 = calcMA(closes, 10);
  const ma20 = calcMA(closes, 20);
  
  // RSI
  const rsi = calcRSI(closes, 14);
  
  // Volatility (low vol = more ties = UP edge)
  const vol = calcVolatility(candles, 10);
  const lowVol = vol < 0.0005; // very low movement
  
  // Recent direction
  const dir5 = consecutiveDirection(candles, 5);
  const dir10 = consecutiveDirection(candles, 10);
  
  // Volume trend (rising volume = stronger signal)
  const recentVol = candles.slice(-5).reduce((a, c) => a + c.volume, 0);
  const priorVol = candles.slice(-10, -5).reduce((a, c) => a + c.volume, 0);
  const volRising = recentVol > priorVol * 1.2;
  
  // --- Scoring system ---
  let score = 0; // positive = UP, negative = DOWN
  const reasons = [];
  
  // 1. MA alignment (strongest signal)
  if (ma5 > ma10 && ma10 > ma20) {
    score += 2;
    reasons.push('MA5>MA10>MA20 (strong uptrend)');
  } else if (ma5 < ma10 && ma10 < ma20) {
    score -= 2;
    reasons.push('MA5<MA10<MA20 (strong downtrend)');
  } else if (ma5 > ma10) {
    score += 1;
    reasons.push('MA5>MA10 (short-term bullish)');
  } else if (ma5 < ma10) {
    score -= 1;
    reasons.push('MA5<MA10 (short-term bearish)');
  }
  
  // 2. Recent candle direction
  if (dir5.strength >= 0.8) {
    const pts = dir5.streak === 'UP' ? 1.5 : -1.5;
    score += pts;
    reasons.push(`${dir5.ups}/5 candles UP (${dir5.streak} momentum)`);
  } else if (dir5.strength >= 0.6) {
    const pts = dir5.streak === 'UP' ? 0.5 : -0.5;
    score += pts;
    reasons.push(`${dir5.ups}/5 candles UP (weak ${dir5.streak})`);
  }
  
  // 3. RSI extremes (contrarian at extremes, trend-following in middle)
  if (rsi > 70) {
    score -= 1; // overbought, might reverse
    reasons.push(`RSI ${rsi.toFixed(1)} (overbought, caution)`);
  } else if (rsi < 30) {
    score += 1; // oversold, might bounce
    reasons.push(`RSI ${rsi.toFixed(1)} (oversold, potential bounce)`);
  } else if (rsi > 55) {
    score += 0.5;
    reasons.push(`RSI ${rsi.toFixed(1)} (bullish zone)`);
  } else if (rsi < 45) {
    score -= 0.5;
    reasons.push(`RSI ${rsi.toFixed(1)} (bearish zone)`);
  }
  
  // 4. Low volatility = UP edge (ties resolve UP)
  if (lowVol) {
    score += 1;
    reasons.push('Low volatility (tie edge → UP)');
  }
  
  // 5. Volume confirmation
  if (volRising && Math.abs(score) > 0) {
    score *= 1.2;
    reasons.push('Rising volume (confirms direction)');
  }
  
  // --- Decision ---
  const absScore = Math.abs(score);
  let decision, confidence;
  
  if (absScore >= 3) {
    decision = score > 0 ? 'BET_UP' : 'BET_DOWN';
    confidence = 'HIGH';
  } else if (absScore >= 2) {
    decision = score > 0 ? 'BET_UP' : 'BET_DOWN';
    confidence = 'MEDIUM';
  } else {
    decision = 'NO_BET';
    confidence = 'LOW';
  }
  
  return {
    decision,
    confidence,
    score: parseFloat(score.toFixed(2)),
    currentPrice,
    rsi: parseFloat(rsi.toFixed(1)),
    ma5: parseFloat(ma5.toFixed(2)),
    ma10: parseFloat(ma10.toFixed(2)),
    ma20: parseFloat(ma20.toFixed(2)),
    volatility: parseFloat((vol * 100).toFixed(4)),
    dir5: `${dir5.ups}/${5} UP`,
    dir10: `${dir10.ups}/${10} UP`,
    volRising,
    reasons,
    timestamp: new Date().toISOString(),
  };
}

// --- Logging ---
function logTrade(analysis, betSize, dryRun) {
  let log = [];
  try { log = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); } catch {}
  
  log.push({
    ...analysis,
    betSize: analysis.decision !== 'NO_BET' ? betSize : 0,
    dryRun,
    resolved: false,
    result: null,
  });
  
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
  return log.length;
}

function getStats() {
  let log = [];
  try { log = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); } catch { return null; }
  
  const bets = log.filter(l => l.decision !== 'NO_BET' && l.resolved);
  const wins = bets.filter(b => b.result === 'WIN');
  const totalBet = bets.reduce((a, b) => a + (b.betSize || 0), 0);
  const totalReturn = wins.length * 2 - bets.length; // simplified: win = 2x, lose = 0
  
  return {
    totalBets: bets.length,
    wins: wins.length,
    losses: bets.length - wins.length,
    winRate: bets.length > 0 ? ((wins.length / bets.length) * 100).toFixed(1) + '%' : 'N/A',
    totalWagered: totalBet.toFixed(2),
    pnl: ((totalReturn * (totalBet / bets.length || 0))).toFixed(2),
    skipped: log.filter(l => l.decision === 'NO_BET').length,
  };
}

// --- Main ---
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const betIdx = args.indexOf('--bet-size');
  const betSize = betIdx >= 0 ? parseFloat(args[betIdx + 1]) : BET_SIZE_DEFAULT;
  const showStats = args.includes('--stats');
  
  if (showStats) {
    const stats = getStats();
    console.log(JSON.stringify(stats || { error: 'No trades logged yet' }, null, 2));
    return;
  }
  
  console.log('📊 Fetching BTC 1-min candles...');
  const candles = await getCandles(60);
  
  console.log('🧠 Analyzing...');
  const analysis = analyzeAndDecide(candles);
  
  const tradeNum = logTrade(analysis, betSize, dryRun);
  
  console.log('\n' + '='.repeat(50));
  console.log(`🎯 SIGNAL: ${analysis.decision} (${analysis.confidence} confidence)`);
  console.log(`   Score: ${analysis.score} | BTC: $${analysis.currentPrice.toFixed(2)}`);
  console.log(`   RSI: ${analysis.rsi} | Vol: ${analysis.volatility}%`);
  console.log(`   MA5: ${analysis.ma5} > MA10: ${analysis.ma10} > MA20: ${analysis.ma20}`);
  console.log(`   Recent: ${analysis.dir5} (5-candle) | ${analysis.dir10} (10-candle)`);
  console.log(`   Volume rising: ${analysis.volRising}`);
  console.log('   Reasons:');
  analysis.reasons.forEach(r => console.log(`     • ${r}`));
  console.log('='.repeat(50));
  
  if (analysis.decision !== 'NO_BET') {
    console.log(`\n💰 ${dryRun ? '[DRY RUN] Would bet' : 'Bet'}: $${betSize} on ${analysis.decision === 'BET_UP' ? 'UP ⬆️' : 'DOWN ⬇️'}`);
    console.log(`   Trade #${tradeNum}`);
  } else {
    console.log(`\n⏸️  No bet — insufficient edge. Skipping this round.`);
  }
  
  // Output machine-readable for automation
  console.log(`\n__SIGNAL__:${analysis.decision}:${analysis.score}:${analysis.currentPrice}:${betSize}`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
