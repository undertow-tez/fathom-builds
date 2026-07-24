'use strict';
/**
 * market.js — data + feature layer for the v2 strategy.
 *
 * Responsibilities:
 *   1. Binance 1-min candles (with the existing local price-feed cache as a
 *      transparent fast path, REST as fallback).
 *   2. Window math (strike time / end time / Polymarket slug) computed from
 *      raw UTC epoch — no timezone handling, which makes it DST-proof.
 *   3. Strike = the OPEN price of the window's first minute.
 *   4. Polymarket implied prices (the number we actually pay), from gamma.
 *
 * Everything here does I/O; keep the math in lib/model.js.
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PRICE_FEED_DIR = path.join(__dirname, '..', 'price-feed');
const SYMBOLS = { btc: 'BTCUSDT', eth: 'ETHUSDT', sol: 'SOLUSDT', xrp: 'XRPUSDT' };
const TF_SECONDS = { '5m': 300, '15m': 900 };

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'fathom-bot/2.0' }, timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse failed: ${data.slice(0, 160)}`));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
  });
}

/**
 * Window boundaries + slug for `asset`/`tf` at time `nowMs` (default now).
 * Slug ts = floor(epoch / tfSeconds) * tfSeconds — aligned to :00/:15/:30/:45
 * in both UTC and ET (whole-hour offset), so no timezone math is needed.
 */
function getWindow(asset, tf, nowMs = Date.now()) {
  const tfSec = TF_SECONDS[tf];
  if (!tfSec) throw new Error(`Unknown timeframe: ${tf}`);
  const nowSec = Math.floor(nowMs / 1000);
  const startSec = Math.floor(nowSec / tfSec) * tfSec;
  const endSec = startSec + tfSec;
  const slug = `${asset}-updown-${tf}-${startSec}`;
  return {
    asset,
    tf,
    startSec,
    endSec,
    slug,
    minutesLeft: Math.max(0, (endSec - nowSec) / 60),
    elapsedMin: (nowSec - startSec) / 60,
  };
}

function getCandlesFromCache(asset, limit) {
  const cachePath = path.join(PRICE_FEED_DIR, `candles-${asset}.json`);
  try {
    if (!fs.existsSync(cachePath)) return null;
    const ageMs = Date.now() - fs.statSync(cachePath).mtimeMs;
    if (ageMs > 180000) return null; // stale (>3 min) => feed likely down
    const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const candles = raw.candles || [];
    if (candles.length < 20) return null;
    return candles.slice(-limit);
  } catch {
    return null;
  }
}

/** 1-min candles, newest last. Local feed cache first, Binance REST fallback. */
async function getCandles(asset, limit = 60) {
  const cached = getCandlesFromCache(asset, limit);
  if (cached) return cached;
  const symbol = SYMBOLS[asset.toLowerCase()] || 'BTCUSDT';
  const data = await fetchJSON(
    `https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=1m&limit=${limit}`
  );
  return data.map((c) => ({
    time: c[0], // openTime ms
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5]),
  }));
}

/**
 * Strike price = open of the candle whose openTime == window start.
 * Falls back to the earliest candle's open if that exact minute isn't present.
 */
function strikeFromCandles(candles, startSec) {
  const startMs = startSec * 1000;
  const exact = candles.find((c) => c.time === startMs);
  if (exact) return exact.open;
  // Otherwise pick the candle covering the window start.
  const covering = candles.filter((c) => c.time <= startMs).slice(-1)[0];
  return covering ? covering.close : candles[0].open;
}

/**
 * Polymarket implied prices for a slug via gamma.
 * Returns { upPrice, downPrice, closed, endDateMs, title } or null.
 * NOTE: gamma `outcomePrices` is a mid-ish mark, not a live orderbook ask.
 * Good enough for shadow-mode validation; live mode should prefer the CLOB
 * ask (see references/strategy-v2.md, "Known limitations").
 */
async function getMarketPrices(slug) {
  let data;
  try {
    data = await fetchJSON(`https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}`);
  } catch {
    return null;
  }
  if (!data || !data.length) return null;
  const m = data[0];
  let prices, outcomes;
  try {
    prices = JSON.parse(m.outcomePrices || '[]').map(parseFloat);
  } catch {
    prices = [];
  }
  try {
    outcomes = JSON.parse(m.outcomes || '[]').map((s) => String(s).toLowerCase());
  } catch {
    outcomes = [];
  }
  // Map to UP/DOWN by outcome label; default index 0 = UP.
  let upIdx = outcomes.findIndex((o) => o === 'up' || o === 'yes');
  if (upIdx < 0) upIdx = 0;
  const downIdx = upIdx === 0 ? 1 : 0;
  return {
    upPrice: prices[upIdx] != null ? prices[upIdx] : null,
    downPrice: prices[downIdx] != null ? prices[downIdx] : null,
    closed: !!m.closed,
    endDateMs: m.endDate ? Date.parse(m.endDate) : null,
    title: m.question || m.title || slug,
  };
}

/**
 * Build the full feature set the model needs for one window, right now.
 * Returns null (with .error) when data is insufficient.
 */
async function buildFeatures(asset, tf, cfg = {}, nowMs = Date.now()) {
  const w = getWindow(asset, tf, nowMs);
  const candles = await getCandles(asset, 60);
  if (!candles || candles.length < 21) {
    return { window: w, error: 'insufficient candles' };
  }
  const spot = candles[candles.length - 1].close;
  const strike = strikeFromCandles(candles, w.startSec);
  const sigmaPerMin = require('./model').volPerMinute(candles, cfg.volLookback || 30);
  const market = await getMarketPrices(w.slug);

  return {
    window: w,
    asset,
    tf,
    slug: w.slug,
    spot,
    strike,
    distancePct: strike > 0 ? ((spot - strike) / strike) * 100 : 0,
    sigmaPerMin,
    minutesLeft: w.minutesLeft,
    elapsedMin: w.elapsedMin,
    upPrice: market ? market.upPrice : null,
    downPrice: market ? market.downPrice : null,
    marketTitle: market ? market.title : null,
    marketClosed: market ? market.closed : null,
    marketFound: !!market,
  };
}

module.exports = {
  fetchJSON,
  getWindow,
  getCandles,
  strikeFromCandles,
  getMarketPrices,
  buildFeatures,
  TF_SECONDS,
  SYMBOLS,
};
