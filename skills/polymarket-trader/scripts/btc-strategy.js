#!/usr/bin/env node
/**
 * BTC (and friends) 15-min Up/Down momentum strategy.
 *
 * Ports the live-tested crypto-updown-trader scoring (64% all-time WR) with the
 * advanced filters built in:
 *   - MA alignment, candle direction, RSI zones, low-vol tie edge, volume boost
 *   - Hourly trend filter (don't bet UP into a falling hour)
 *   - Strict DOWN qualification (ties resolve UP — DOWN needs everything aligned)
 *   - maxScore cap (momentum-trap protection) and upOnly mode
 *
 * Also resolves the current market via slug math (the only reliable lookup) and
 * emits a machine-readable signal line for the cycle script:
 *   __SIGNAL__:{"decision":"BET_UP","score":3.5,"price":...,"slug":...,"question":...}
 *
 * Usage: node btc-strategy.js [--asset btc] [--timeframe 15m] [--config path] [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const args = process.argv.slice(2);
function argVal(name, dflt) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
}

const CONFIG_PATH = argVal('--config', path.join(__dirname, '..', 'config.json'));
let config = {};
try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch {}
const btcCfg = config.btc || {};

const ASSET = (argVal('--asset', (btcCfg.assets || ['btc'])[0]) || 'btc').toLowerCase();
const TIMEFRAME = argVal('--timeframe', btcCfg.timeframe || '15m');
const TF_MINUTES = TIMEFRAME === '5m' ? 5 : 15;
const MIN_SCORE = btcCfg.minScore ?? 3;
const MAX_SCORE = btcCfg.maxScore ?? null;
const UP_ONLY = btcCfg.upOnly ?? false;

const SYMBOLS = { btc: 'BTCUSDT', eth: 'ETHUSDT', sol: 'SOLUSDT', xrp: 'XRPUSDT' };

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'polymarket-trader/1.0' } }, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse failed for ${url}: ${data.slice(0, 120)}`)); }
      });
    }).on('error', reject);
  });
}

async function getCandles(limit = 60) {
  const symbol = SYMBOLS[ASSET] || 'BTCUSDT';
  const hosts = ['api.binance.com', 'api.binance.us'];
  let lastErr;
  for (const host of hosts) {
    try {
      const data = await fetchJSON(`https://${host}/api/v3/klines?symbol=${symbol}&interval=1m&limit=${limit}`);
      if (Array.isArray(data)) {
        return data.map(c => ({
          time: c[0], open: +c[1], high: +c[2], low: +c[3], close: +c[4], volume: +c[5],
        }));
      }
      lastErr = new Error(`Unexpected response from ${host}`);
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

// --- Indicators ---
const ma = (xs, p) => xs.length >= p ? xs.slice(-p).reduce((a, b) => a + b, 0) / p : null;

function rsi(xs, period = 14) {
  if (xs.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = xs.length - period; i < xs.length; i++) {
    const d = xs[i] - xs[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / losses);
}

function volatility(candles, period = 10) {
  const rets = candles.slice(-period).map(c => (c.close - c.open) / c.open);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  return Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length);
}

function direction(candles, lookback) {
  const recent = candles.slice(-lookback);
  const ups = recent.filter(c => c.close >= c.open).length;
  return { ups, downs: lookback - ups, streak: ups > lookback - ups ? 'UP' : 'DOWN', strength: Math.max(ups, lookback - ups) / lookback };
}

// --- Scoring (same weights as the live-tested strategy) ---
function analyze(candles) {
  const closes = candles.map(c => c.close);
  const price = closes[closes.length - 1];
  const ma5 = ma(closes, 5), ma10 = ma(closes, 10), ma20 = ma(closes, 20);
  const r = rsi(closes);
  const vol = volatility(candles);
  const dir5 = direction(candles, 5);

  let score = 0;
  const reasons = [];

  if (ma5 > ma10 && ma10 > ma20) { score += 2; reasons.push('MA5>MA10>MA20 (strong uptrend)'); }
  else if (ma5 < ma10 && ma10 < ma20) { score -= 2; reasons.push('MA5<MA10<MA20 (strong downtrend)'); }
  else if (ma5 > ma10) { score += 1; reasons.push('MA5>MA10 (short-term bullish)'); }
  else if (ma5 < ma10) { score -= 1; reasons.push('MA5<MA10 (short-term bearish)'); }

  if (dir5.strength >= 0.8) { score += dir5.streak === 'UP' ? 1.5 : -1.5; reasons.push(`${dir5.ups}/5 candles UP (${dir5.streak} momentum)`); }
  else if (dir5.strength >= 0.6) { score += dir5.streak === 'UP' ? 0.5 : -0.5; reasons.push(`${dir5.ups}/5 candles UP (weak ${dir5.streak})`); }

  if (r > 70) { score -= 1; reasons.push(`RSI ${r.toFixed(1)} (overbought, caution)`); }
  else if (r < 30) { score += 1; reasons.push(`RSI ${r.toFixed(1)} (oversold, potential bounce)`); }
  else if (r > 55) { score += 0.5; reasons.push(`RSI ${r.toFixed(1)} (bullish zone)`); }
  else if (r < 45) { score -= 0.5; reasons.push(`RSI ${r.toFixed(1)} (bearish zone)`); }

  const lowVol = vol < 0.0005;
  if (lowVol) { score += 1; reasons.push('Low volatility (tie edge → UP)'); }

  const recentVol = candles.slice(-5).reduce((a, c) => a + c.volume, 0);
  const priorVol = candles.slice(-10, -5).reduce((a, c) => a + c.volume, 0);
  if (recentVol > priorVol * 1.2 && Math.abs(score) > 0) { score *= 1.2; reasons.push('Rising volume (confirms direction)'); }

  // Hourly trend from the full 60-min window
  const hourlyChange = (price - closes[0]) / closes[0];
  if (hourlyChange < -0.005 && score > 0) {
    reasons.push(`Hourly down ${(hourlyChange * 100).toFixed(2)}% — killing UP signal (falling knife)`);
    score = 0;
  } else if (hourlyChange > 0.005 && score > 0) {
    score += 0.5;
    reasons.push(`Hourly up ${(hourlyChange * 100).toFixed(2)}% (trend confirmation +0.5)`);
  }

  // Decision
  let decision = 'NO_BET';
  if (score >= MIN_SCORE) decision = 'BET_UP';
  else if (score <= -MIN_SCORE) decision = 'BET_DOWN';

  // maxScore cap: extreme scores historically mean exhaustion, not continuation
  if (MAX_SCORE !== null && Math.abs(score) > MAX_SCORE) {
    reasons.push(`|score| ${Math.abs(score).toFixed(1)} > maxScore ${MAX_SCORE} — momentum trap filter`);
    decision = 'NO_BET';
  }

  // Strict DOWN qualification: ties resolve UP, so DOWN needs everything aligned
  if (decision === 'BET_DOWN') {
    const qualified =
      score <= -4 &&
      hourlyChange < -0.005 &&
      vol > 0.0005 &&
      r >= 30 && r <= 45;
    if (UP_ONLY) { reasons.push('upOnly mode — DOWN filtered'); decision = 'NO_BET'; }
    else if (!qualified) {
      reasons.push(`DOWN not qualified (need score≤-4, hourly<-0.5%, vol>0.05%, RSI 30-45) — filtered`);
      decision = 'NO_BET';
    }
  }

  return { decision, score: +score.toFixed(2), price, rsi: +r.toFixed(1), vol: +(vol * 100).toFixed(4), hourlyChange: +(hourlyChange * 100).toFixed(3), reasons };
}

// --- Market lookup: slug math is the only reliable method ---
// Window boundaries align to :00/:15/:30/:45 UTC, so flooring the unix time works.
async function findMarket() {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowSec = TF_MINUTES * 60;
  const ts = Math.floor(nowSec / windowSec) * windowSec;
  for (const t of [ts, ts - windowSec]) {
    const slug = `${ASSET}-updown-${TIMEFRAME}-${t}`;
    try {
      const data = await fetchJSON(`https://gamma-api.polymarket.com/markets?slug=${slug}`);
      if (Array.isArray(data) && data[0] && !data[0].closed) {
        const m = data[0];
        const endDate = m.endDate ? new Date(m.endDate) : null;
        // Need >2 min left — Bankr is too slow for the final stretch
        if (!endDate || endDate.getTime() - Date.now() > 2 * 60 * 1000) {
          return { slug, question: m.question || m.title || slug, endDate: m.endDate };
        }
      }
    } catch { /* try next */ }
  }
  return null;
}

async function main() {
  console.log(`📊 ${ASSET.toUpperCase()} ${TIMEFRAME} — fetching 1-min candles...`);
  const candles = await getCandles(60);
  const a = analyze(candles);

  console.log(`\n🎯 SIGNAL: ${a.decision} (score ${a.score})`);
  console.log(`   Price: $${a.price} | RSI: ${a.rsi} | Vol: ${a.vol}% | Hourly: ${a.hourlyChange}%`);
  a.reasons.forEach(r => console.log(`     • ${r}`));

  let market = null;
  if (a.decision !== 'NO_BET') {
    market = await findMarket();
    if (!market) {
      console.log('❌ No active market with >2 min remaining — downgrading to NO_BET');
      a.decision = 'NO_BET';
      a.reasons.push('no active market window');
    } else {
      console.log(`📋 Market: ${market.question} (${market.slug})`);
    }
  }

  console.log(`\n__SIGNAL__:${JSON.stringify({
    decision: a.decision, score: a.score, price: a.price,
    rsi: a.rsi, vol: a.vol, hourly: a.hourlyChange,
    slug: market?.slug || null, question: market?.question || null,
    asset: ASSET, timeframe: TIMEFRAME,
  })}`);
}

if (require.main === module) {
  main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
}

module.exports = { analyze };
