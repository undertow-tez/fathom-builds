#!/usr/bin/env node
/**
 * price-feed/feed.js — Real-time WebSocket price feed for BTC (and other assets)
 *
 * Connects to Binance WebSocket and maintains a rolling window of 1-min candles
 * locally. Writes to candles.json on every close so strategy.js can read it
 * instantly without making any API calls.
 *
 * Supports multiple assets via ASSETS env var or command-line arg:
 *   node feed.js btc            # BTC only (default)
 *   node feed.js btc,eth,sol    # Multiple assets
 *
 * Output: writes to ./candles-<asset>.json per asset
 *
 * Fallback: if this service isn't running, strategy.js falls back to REST.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { createConnection } = require('net');

// --- Config ---
const CACHE_DIR = path.join(__dirname);
const CANDLE_LIMIT = 120;       // keep 120 candles (2 hours of 1-min data)
const RECONNECT_DELAY = 5000;   // 5s reconnect on disconnect
const BINANCE_WS_HOST = 'stream.binance.us';
const BINANCE_WS_PORT = 9443;

const args = process.argv.slice(2);
const ASSETS = (args[0] || process.env.ASSETS || 'btc').toLowerCase().split(',').map(a => a.trim());

const SYMBOL_MAP = {
  btc: 'btcusdt',
  eth: 'ethusdt',
  sol: 'solusdt',
  xrp: 'xrpusdt',
};

// In-memory candle stores per asset
const candleStores = {};
for (const asset of ASSETS) {
  candleStores[asset] = [];
}

function getCachePath(asset) {
  return path.join(CACHE_DIR, `candles-${asset}.json`);
}

function writeCacheFile(asset) {
  const candles = candleStores[asset];
  if (!candles || candles.length === 0) return;
  const out = {
    asset,
    updatedAt: new Date().toISOString(),
    count: candles.length,
    latest: candles[candles.length - 1],
    candles,
  };
  try {
    fs.writeFileSync(getCachePath(asset), JSON.stringify(out));
  } catch (e) {
    console.error(`[feed] Failed to write cache for ${asset}:`, e.message);
  }
}

function processKline(asset, k) {
  const candle = {
    time: k.t,
    open: parseFloat(k.o),
    high: parseFloat(k.h),
    low: parseFloat(k.l),
    close: parseFloat(k.c),
    volume: parseFloat(k.v),
    closed: k.x,  // true when candle is finalized
  };

  const store = candleStores[asset];

  // Update last candle if same time window, or append new
  if (store.length > 0 && store[store.length - 1].time === candle.time) {
    store[store.length - 1] = candle;
  } else {
    store.push(candle);
    // Trim to limit
    if (store.length > CANDLE_LIMIT) {
      candleStores[asset] = store.slice(-CANDLE_LIMIT);
    }
  }

  // Always write on closed candle; write live updates every 10s via interval
  if (candle.closed) {
    writeCacheFile(asset);
    const price = candle.close.toFixed(2);
    console.log(`[${new Date().toISOString().slice(11,19)}] ${asset.toUpperCase()} candle closed: $${price}`);
  }
}

// WebSocket via raw TLS (no ws library dependency)
function connectAsset(asset) {
  const symbol = SYMBOL_MAP[asset];
  if (!symbol) {
    console.error(`[feed] Unknown asset: ${asset}`);
    return;
  }

  const path = `/stream?streams=${symbol}@kline_1m`;
  console.log(`[feed] Connecting to Binance WS for ${asset.toUpperCase()}...`);

  // Use Node.js tls module
  const tls = require('tls');
  const socket = tls.connect({ host: BINANCE_WS_HOST, port: BINANCE_WS_PORT }, () => {
    // Send HTTP upgrade request
    const handshake = [
      `GET ${path} HTTP/1.1`,
      `Host: ${BINANCE_WS_HOST}`,
      `Upgrade: websocket`,
      `Connection: Upgrade`,
      `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==`,
      `Sec-WebSocket-Version: 13`,
      `\r\n`,
    ].join('\r\n');
    socket.write(handshake);
  });

  let buffer = Buffer.alloc(0);
  let upgraded = false;

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    if (!upgraded) {
      const str = buffer.toString();
      if (str.includes('\r\n\r\n')) {
        upgraded = true;
        const headerEnd = buffer.indexOf('\r\n\r\n') + 4;
        buffer = buffer.slice(headerEnd);
        console.log(`[feed] ${asset.toUpperCase()} WebSocket connected`);
      } else {
        return;
      }
    }

    // Parse WebSocket frames
    while (buffer.length >= 2) {
      const b0 = buffer[0];
      const b1 = buffer[1];
      const masked = (b1 & 0x80) !== 0;
      let payloadLen = b1 & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (buffer.length < 4) break;
        payloadLen = buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (buffer.length < 10) break;
        payloadLen = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }

      const maskLen = masked ? 4 : 0;
      const totalLen = offset + maskLen + payloadLen;
      if (buffer.length < totalLen) break;

      let payload = buffer.slice(offset + maskLen, totalLen);
      if (masked) {
        const mask = buffer.slice(offset, offset + 4);
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= mask[i % 4];
        }
      }

      buffer = buffer.slice(totalLen);

      const opcode = b0 & 0x0f;
      if (opcode === 0x1) { // text frame
        try {
          const msg = JSON.parse(payload.toString());
          if (msg.data && msg.data.k) {
            processKline(asset, msg.data.k);
          } else if (msg.k) {
            processKline(asset, msg.k);
          }
        } catch {}
      } else if (opcode === 0x9) { // ping
        // Send pong
        const pong = Buffer.from([0x8a, 0x00]);
        socket.write(pong);
      } else if (opcode === 0x8) { // close
        socket.destroy();
      }
    }
  });

  socket.on('error', (e) => {
    console.error(`[feed] ${asset.toUpperCase()} socket error:`, e.message);
  });

  socket.on('close', () => {
    console.log(`[feed] ${asset.toUpperCase()} disconnected — reconnecting in ${RECONNECT_DELAY/1000}s`);
    setTimeout(() => connectAsset(asset), RECONNECT_DELAY);
  });
}

// Write live candle updates every 10s (even if candle not closed yet)
setInterval(() => {
  for (const asset of ASSETS) {
    if (candleStores[asset].length > 0) {
      writeCacheFile(asset);
    }
  }
}, 10000);

// Prefill from REST on startup so we have history immediately
async function prefillFromREST(asset) {
  const symbol = (SYMBOL_MAP[asset] || asset + 'usdt').toUpperCase();
  const url = `https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=1m&limit=${CANDLE_LIMIT}`;

  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'fathom-feed/1.0' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const rows = JSON.parse(data);
          candleStores[asset] = rows.map(c => ({
            time: c[0],
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4]),
            volume: parseFloat(c[5]),
            closed: true,
          }));
          writeCacheFile(asset);
          console.log(`[feed] ${asset.toUpperCase()} prefilled with ${candleStores[asset].length} candles from REST`);
        } catch (e) {
          console.error(`[feed] REST prefill failed for ${asset}:`, e.message);
        }
        resolve();
      });
    }).on('error', () => resolve());
  });
}

async function main() {
  console.log(`[feed] Starting price feed for: ${ASSETS.join(', ').toUpperCase()}`);
  console.log(`[feed] Cache dir: ${CACHE_DIR}`);

  // Prefill from REST first so there's immediately useful data
  for (const asset of ASSETS) {
    await prefillFromREST(asset);
  }

  // Then connect WebSocket for live updates
  for (const asset of ASSETS) {
    connectAsset(asset);
  }

  console.log(`[feed] Running. Press Ctrl+C to stop.`);
}

main().catch(e => { console.error(e); process.exit(1); });
