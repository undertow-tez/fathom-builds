#!/usr/bin/env node
/**
 * Crypto Up/Down Polymarket Strategy (Multi-Asset)
 * 
 * Analyzes short-term momentum for any supported asset and outputs a signal:
 *   BET_UP, BET_DOWN, or NO_BET (when edge is insufficient)
 * 
 * Supported assets: BTC, ETH, SOL, XRP (5m and 15m markets)
 * 
 * Edges exploited:
 *   1. Ties resolve UP (structural edge for UP in low-vol periods)
 *   2. Short-term momentum (trend continuation in short windows)
 *   3. Only bet when indicators align (selective, not every window)
 * 
 * Usage: node strategy.js [--asset btc] [--timeframe 15m] [--dry-run] [--bet-size 3] [--min-score 2]
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const LOG_FILE = __dirname + '/trade-log.json';
const CONFIG_FILE = __dirname + '/config.json';
const BET_SIZE_DEFAULT = 3;

// --- Asset config ---
const ASSETS = {
  btc: { symbol: 'BTCUSDT', name: 'Bitcoin', slug: 'btc' },
  eth: { symbol: 'ETHUSDT', name: 'Ethereum', slug: 'eth' },
  sol: { symbol: 'SOLUSDT', name: 'Solana', slug: 'sol' },
  xrp: { symbol: 'XRPUSDT', name: 'XRP', slug: 'xrp' },
};

const TIMEFRAMES = {
  '5m':  { minutes: 5,  candleInterval: '1m', candleCount: 30, cronOffsets: [3, 8] },
  '15m': { minutes: 15, candleInterval: '1m', candleCount: 60, cronOffsets: [8, 23, 38, 53] },
};

// --- Load config ---
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch { return {}; }
}

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

// --- Get 1-min candles from Binance ---
async function getCandles(symbol, interval, limit) {
  const data = await fetchJSON(`https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
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
  if (prices.length < period + 1) return 50;
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
function analyzeAndDecide(candles, minScore = 2, maxScore = null, upOnly = true) {
  const closes = candles.map(c => c.close);
  const currentPrice = closes[closes.length - 1];
  
  const ma5 = calcMA(closes, 5);
  const ma10 = calcMA(closes, 10);
  const ma20 = calcMA(closes, 20);
  const rsi = calcRSI(closes, 14);
  const vol = calcVolatility(candles, 10);
  const lowVol = vol < 0.0005;
  const dir5 = consecutiveDirection(candles, 5);
  const dir10 = consecutiveDirection(candles, 10);
  
  const recentVol = candles.slice(-5).reduce((a, c) => a + c.volume, 0);
  const priorVol = candles.slice(-10, -5).reduce((a, c) => a + c.volume, 0);
  const volRising = recentVol > priorVol * 1.2;
  
  // --- Hourly trend filter (higher timeframe context) ---
  // Use the full candle set (~60 1-min candles) to check hourly direction
  const hourlyStart = candles.length >= 60 ? candles[candles.length - 60].close : candles[0].close;
  const hourlyChange = (currentPrice - hourlyStart) / hourlyStart;
  const hourlyTrendDown = hourlyChange < -0.005; // down >0.5% over last hour
  const hourlyTrendUp = hourlyChange > 0.005;    // up >0.5% over last hour
  
  let score = 0;
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
  
  // 3. RSI extremes
  if (rsi > 70) {
    score -= 1;
    reasons.push(`RSI ${rsi.toFixed(1)} (overbought, caution)`);
  } else if (rsi < 30) {
    score += 1;
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
  
  // 6. Hourly trend filter — don't bet UP into a falling market
  if (hourlyTrendDown && score > 0) {
    reasons.push(`Hourly trend DOWN (${(hourlyChange * 100).toFixed(2)}%) — UP signal overridden`);
    score = 0; // Kill the UP signal entirely
  } else if (hourlyTrendDown) {
    reasons.push(`Hourly trend DOWN (${(hourlyChange * 100).toFixed(2)}%) — confirms bearish`);
  } else if (hourlyTrendUp && score > 0) {
    score += 0.5;
    reasons.push(`Hourly trend UP (${(hourlyChange * 100).toFixed(2)}%) — confirms bullish`);
  } else {
    reasons.push(`Hourly trend: ${(hourlyChange * 100).toFixed(2)}% (neutral)`);
  }
  
  const absScore = Math.abs(score);
  let decision, confidence;
  
  // --- DOWN bet qualification (strict) ---
  // Ties resolve UP = structural disadvantage for DOWN bets
  // Only bet DOWN when ALL conditions met:
  //   1. Score ≤ -4 (strong bearish)
  //   2. Hourly trend down >0.5% (trend confirmed)
  //   3. Volatility > 0.05% (price moving, ties unlikely)
  //   4. RSI 30-45 (bearish but not oversold bounce)
  const downQualified = (
    score <= -4 &&
    hourlyTrendDown &&
    vol > 0.0005 &&
    rsi >= 30 && rsi <= 45
  );
  
  if (downQualified) {
    reasons.push('DOWN QUALIFIED: score ≤-4 + hourly confirms + vol high + RSI 30-45');
  } else if (score <= -4) {
    // Log why DOWN didn't qualify
    const fails = [];
    if (!hourlyTrendDown) fails.push(`hourly not down enough (${(hourlyChange*100).toFixed(2)}%)`);
    if (vol <= 0.0005) fails.push(`vol too low (${(vol*100).toFixed(4)}%)`);
    if (rsi < 30) fails.push(`RSI ${rsi.toFixed(1)} oversold (bounce risk)`);
    if (rsi > 45) fails.push(`RSI ${rsi.toFixed(1)} not bearish enough`);
    reasons.push(`DOWN signal but not qualified: ${fails.join(', ')}`);
  }
  
  if (absScore >= 3) {
    if (score > 0) {
      decision = 'BET_UP';
      confidence = 'HIGH';
    } else if (downQualified) {
      decision = 'BET_DOWN';
      confidence = 'HIGH';
    } else {
      decision = 'NO_BET';
      confidence = 'FILTERED';
    }
  } else if (absScore >= minScore) {
    if (score > 0) {
      decision = 'BET_UP';
      confidence = 'MEDIUM';
    } else {
      decision = 'NO_BET';
      confidence = 'FILTERED';
    }
  } else {
    decision = 'NO_BET';
    confidence = 'LOW';
  }
  
  if (score < 0 && absScore >= minScore && !downQualified) {
    reasons.push('DOWN signal filtered (strict qualification not met — ties resolve UP)');
  }
  
  // --- Score cap filter (prevent momentum traps) ---
  if (maxScore !== null && score > maxScore) {
    reasons.push(`Score ${score.toFixed(2)} > maxScore ${maxScore} — historically 33% win rate (momentum trap risk)`);
    decision = 'NO_BET';
    confidence = 'CAPPED';
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
function logTrade(analysis, asset, timeframe, betSize, dryRun) {
  let log = [];
  try { log = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); } catch {}
  
  log.push({
    ...analysis,
    asset,
    timeframe,
    betSize: analysis.decision !== 'NO_BET' ? betSize : 0,
    dryRun,
    resolved: false,
    result: null,
  });
  
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
  return log.length;
}

function getStats(filterAsset) {
  let log = [];
  try { log = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); } catch { return null; }
  
  if (filterAsset) log = log.filter(l => (l.asset || 'btc') === filterAsset);
  
  const bets = log.filter(l => l.decision !== 'NO_BET' && l.resolved);
  const wins = bets.filter(b => b.result === 'WIN');
  const totalBet = bets.reduce((a, b) => a + (b.betSize || 0), 0);
  const totalReturn = wins.length * 2 - bets.length;
  
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

// --- Budget calculator ---
function calculateBetSize(budget, durationHours, timeframeMinutes, selectivityRate = 0.3) {
  const windowsPerHour = 60 / timeframeMinutes;
  const totalWindows = windowsPerHour * durationHours;
  const expectedBets = Math.ceil(totalWindows * selectivityRate);
  return Math.max(1, Math.floor((budget / expectedBets) * 100) / 100);
}

// --- Main ---
async function main() {
  const args = process.argv.slice(2);
  const config = loadConfig();
  
  // Parse args (CLI overrides config)
  const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
  
  const asset = (getArg('--asset') || config.asset || 'btc').toLowerCase();
  const timeframe = getArg('--timeframe') || config.timeframe || '15m';
  const dryRun = args.includes('--dry-run');
  const betSizeArg = getArg('--bet-size') ? parseFloat(getArg('--bet-size')) : null;
  const minScore = getArg('--min-score') ? parseFloat(getArg('--min-score')) : (config.minScore || 2);
  const maxScore = getArg('--max-score') ? parseFloat(getArg('--max-score')) : (config.maxScore || null);
  const showStats = args.includes('--stats');
  const showConfig = args.includes('--show-config');
  
  if (showConfig) {
    const tfConfig = TIMEFRAMES[timeframe];
    const assetConfig = ASSETS[asset];
    console.log(JSON.stringify({
      asset: assetConfig,
      timeframe: { name: timeframe, ...tfConfig },
      slugPattern: `${assetConfig.slug}-updown-${timeframe}-{unix_timestamp}`,
      cronSchedule: tfConfig.cronOffsets.map(o => `${o} * * * *`),
      tieResolution: 'UP (greater than or equal = UP wins)',
    }, null, 2));
    return;
  }
  
  if (showStats) {
    const stats = getStats(asset);
    console.log(JSON.stringify(stats || { error: 'No trades logged yet' }, null, 2));
    return;
  }
  
  const assetConfig = ASSETS[asset];
  const tfConfig = TIMEFRAMES[timeframe];
  
  if (!assetConfig) {
    console.error(`❌ Unknown asset: ${asset}. Supported: ${Object.keys(ASSETS).join(', ')}`);
    process.exit(1);
  }
  if (!tfConfig) {
    console.error(`❌ Unknown timeframe: ${timeframe}. Supported: ${Object.keys(TIMEFRAMES).join(', ')}`);
    process.exit(1);
  }
  
  // Calculate bet size from budget if provided
  let betSize = betSizeArg || config.betSize || BET_SIZE_DEFAULT;
  if (!betSizeArg && config.budget && config.budgetDurationHours) {
    betSize = calculateBetSize(config.budget, config.budgetDurationHours, tfConfig.minutes);
    console.log(`💰 Budget mode: $${config.budget} over ${config.budgetDurationHours}h → $${betSize}/bet`);
  }
  
  console.log(`📊 Fetching ${assetConfig.name} ${tfConfig.candleInterval} candles...`);
  const candles = await getCandles(assetConfig.symbol, tfConfig.candleInterval, tfConfig.candleCount);
  
  console.log('🧠 Analyzing...');
  const upOnly = config.upOnly !== false; // default true
  const analysis = analyzeAndDecide(candles, minScore, maxScore, upOnly);
  
  const tradeNum = logTrade(analysis, asset, timeframe, betSize, dryRun);
  
  console.log('\n' + '='.repeat(50));
  console.log(`🎯 SIGNAL: ${analysis.decision} (${analysis.confidence} confidence)`);
  console.log(`   Asset: ${assetConfig.name} (${timeframe})`);
  console.log(`   Score: ${analysis.score} (min: ${minScore}) | Price: $${analysis.currentPrice.toFixed(2)}`);
  console.log(`   RSI: ${analysis.rsi} | Vol: ${analysis.volatility}%`);
  console.log(`   MA5: ${analysis.ma5} > MA10: ${analysis.ma10} > MA20: ${analysis.ma20}`);
  console.log(`   Recent: ${analysis.dir5} (5-candle) | ${analysis.dir10} (10-candle)`);
  console.log(`   Volume rising: ${analysis.volRising}`);
  console.log('   Reasons:');
  analysis.reasons.forEach(r => console.log(`     • ${r}`));
  console.log('='.repeat(50));
  
  if (analysis.decision !== 'NO_BET') {
    console.log(`\n💰 ${dryRun ? '[DRY RUN] Would bet' : 'Bet'}: $${betSize} on ${analysis.decision === 'BET_UP' ? 'UP ⬆️' : 'DOWN ⬇️'}`);
    console.log(`   Trade #${tradeNum} | ${assetConfig.name} ${timeframe}`);
  } else {
    console.log(`\n⏸️  No bet — insufficient edge. Skipping this round.`);
  }
  
  // Machine-readable output
  console.log(`\n__SIGNAL__:${analysis.decision}:${analysis.score}:${analysis.currentPrice}:${betSize}:${asset}:${timeframe}`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
