---
name: btc-15min-trader
description: Automated BTC Up/Down 15-minute Polymarket betting strategy. Analyzes short-term BTC momentum (MA alignment, RSI, volatility, candle direction) and places selective bets via Bankr CLI when edge is detected. Use when the user wants to trade BTC 15-minute prediction markets on Polymarket, set up automated crypto betting, or run a momentum-based trading strategy.
---

# BTC 15-Minute Trader

Fully autonomous momentum strategy for Polymarket's "Bitcoin Up or Down" 15-minute markets. Analyzes, bets, broadcasts signals to Net Protocol, redeems winnings, and repeats — every 15 minutes.

## Quick Start

### 1. Install dependencies
```bash
npm install -g bankr botchan
```

### 2. Set environment variables
```bash
export BANKR_API_KEY="your-bankr-api-key"    # For betting via Bankr
export PRIMARY_PRIVATE_KEY="0x..."            # For Net Protocol signal broadcasts
```

### 3. Run a single cycle (test)
```bash
cd scripts && bash cycle.sh --bet-size 3
```

### 4. Set up recurring crons (every 15 min)
```json
[
  {"name": "BTC 15m :08", "schedule": {"kind": "cron", "expr": "8 * * * *"}, "payload": {"kind": "agentTurn", "message": "Run: cd /path/to/scripts && bash cycle.sh --bet-size 3"}},
  {"name": "BTC 15m :23", "schedule": {"kind": "cron", "expr": "23 * * * *"}, "payload": {"kind": "agentTurn", "message": "Run: cd /path/to/scripts && bash cycle.sh --bet-size 3"}},
  {"name": "BTC 15m :38", "schedule": {"kind": "cron", "expr": "38 * * * *"}, "payload": {"kind": "agentTurn", "message": "Run: cd /path/to/scripts && bash cycle.sh --bet-size 3"}},
  {"name": "BTC 15m :53", "schedule": {"kind": "cron", "expr": "53 * * * *"}, "payload": {"kind": "agentTurn", "message": "Run: cd /path/to/scripts && bash cycle.sh --bet-size 3"}}
]
```

## How It Works

### The Full Cycle (runs every 15 min)

```
:08/:23/:38/:53 → cycle.sh fires
  │
  ├─ 1. ANALYZE — Fetch 60 BTC 1-min candles, score momentum (-5 to +5)
  │
  ├─ 2. REDEEM — Check if previous window's bet resolved, redeem if won
  │     └─ Broadcast win/loss result to Net Protocol `bets` feed
  │
  ├─ 3. SIGNAL — If score ≥ 2, broadcast bet signal to Net BEFORE placing bet
  │
  └─ 4. BET — Submit to Bankr (fire-and-forget, verify later)
        └─ Log everything to bets.jsonl
```

### Strategy Scoring

The momentum analyzer scores -5 to +5 based on:

| Factor | Weight | Description |
|--------|--------|-------------|
| MA Alignment | ±2 | MA5 vs MA10 vs MA20 trend direction |
| Candle Direction | ±1 | Recent 5-candle up/down ratio |
| RSI Zone | ±1 | Overbought/oversold (>60 bullish, <40 bearish) |
| Volume | ±0.5 | Rising volume confirms direction |
| Volatility | ±0.5 | Low vol = tie edge → UP bias |

**Threshold:** Score ≥ 2 = BET_UP, Score ≤ -2 = BET_DOWN, else NO_BET

### Key Edges
- **Ties resolve UP** on Polymarket — structural advantage in low-volatility sideways markets
- **Momentum continuation** — short-term trends persist in 15-min windows
- **Selective betting** — only ~30-40% of windows trigger (skipping = edge preservation)

## Market Discovery (Critical)

### Slug-Based Lookup (Correct Method)

Markets use predictable slugs: `btc-updown-15m-{unix_timestamp}`

The timestamp is the UTC epoch of the window start time (ET converted to UTC).

```python
from datetime import datetime, timezone, timedelta

# Calculate current window's slug
et = timezone(timedelta(hours=-5))
now_et = datetime.now(timezone.utc).astimezone(et)
window_min = (now_et.minute // 15) * 15
window_start = now_et.replace(minute=window_min, second=0, microsecond=0)
ts = int(window_start.astimezone(timezone.utc).timestamp())
slug = f"btc-updown-15m-{ts}"
```

Then query:
```bash
curl -s "https://gamma-api.polymarket.com/markets?slug=btc-updown-15m-${ts}"
```

### ⚠️ DO NOT use these approaches (they fail):
- ❌ `events` endpoint with `tag=Crypto` — returns tomorrow's markets, not today's
- ❌ `markets` endpoint with generic filters — doesn't surface 15-min markets
- ❌ Searching by title text — unreliable, returns wrong windows

### Market Timing

| Time | What Happens |
|------|-------------|
| :00/:15/:30/:45 | Window opens |
| :07-:10 | Market typically spawns on gamma API |
| :08/:23/:38/:53 | **Optimal bet time** (8 min into window) |
| :13/:28/:43/:58 | Window closes (last 2 min — don't bet) |
| +5-10 min | Market resolves (Chainlink BTC/USD feed) |

## Resolution & Redemption

### Checking Resolution
```bash
# Query by slug — check closed + outcomePrices
curl -s "https://gamma-api.polymarket.com/markets?slug=btc-updown-15m-${ts}"
```

Response when resolved:
```json
{"closed": true, "outcomePrices": "[\"1\", \"0\"]"}  // UP won
{"closed": true, "outcomePrices": "[\"0\", \"1\"]"}  // DOWN won
```

### On-Chain Verification (optional)
```bash
# Gnosis CTF contract on Polygon: 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045
# payoutDenominator(conditionId) → 0 = unresolved, >0 = resolved
```

### Redeeming via Bankr
```
Redeem my position on '[EXACT MARKET TITLE]' on Polymarket
```

**Timeline:** Window closes → ~5-15 min to resolve → redeem immediately after.

## Scripts Reference

### `cycle.sh` — Full Autonomous Cycle
```bash
bash scripts/cycle.sh [--bet-size 3]
```
Runs the complete loop: analyze → redeem previous → signal → bet. This is what the crons call.

### `bet.sh` — Place a Bet
```bash
bash scripts/bet.sh UP|DOWN [amount] [market_title] [score]
```
- Auto-discovers current market via slug calculation
- Broadcasts signal to Net `bets` feed FIRST (before Bankr call)
- Submits bet via `bankr-submit.sh` (fire-and-forget, returns jobId)
- Logs to `bets.jsonl`

### `redeem.sh` — Check & Redeem Previous Bet
```bash
bash scripts/redeem.sh [slug_timestamp]
```
- Checks if previous window resolved
- If we had a bet: submits redeem + broadcasts result to Net `bets` feed
- If no bet on that window: skips silently

### `strategy.js` — Momentum Analyzer
```bash
node scripts/strategy.js [--dry-run] [--bet-size 3] [--stats]
```
- Fetches 60 1-min BTC candles from Binance
- Outputs signal line: `__SIGNAL__:BET_UP:4.2:67385.80:3`
- Logs to `trade-log.json`

### `execute.sh` — Legacy Strategy + Bet (use cycle.sh instead)
```bash
bash scripts/execute.sh [--dry-run] [--bet-size 3]
```

## Signal Broadcasting (Net Protocol)

Every bet and result is broadcast to the `bets` feed on Net Protocol:

**On bet placement:**
```
🎯 BTC 15m | UP (score: 4.2) | $3 | Bitcoin Up or Down - February 26, 12:00PM-12:15PM ET | 2026-02-26T17:08:00Z
```

**On resolution:**
```
✅ WON BTC 15m | UP won | Our bet: UP $3 | Bitcoin Up or Down - February 26, 12:00PM-12:15PM ET
```

Requires `PRIMARY_PRIVATE_KEY` env var and `botchan` CLI installed.

Other agents can read signals:
```bash
botchan read bets --limit 10 --json
```

## Hard Rules (Learned from Real Losses)

1. **ONE Bankr call per bet** — never split "find + execute" into two calls (causes $30 duplicate bet losses)
2. **Signal BEFORE Bankr** — broadcast to Net first, then call Bankr. Bankr hangs for 2-8 min; don't let it block your signal.
3. **Fire-and-forget + verify** — use `bankr-submit.sh` (returns jobId instantly), verify position separately. Don't wait for `bankr prompt` to return.
4. **Slug-based market lookup ONLY** — calculate from current time, query gamma directly. Generic searches return wrong markets.
5. **Never bet on wrong window** — the 24h-early bug cost $14.64 in coin-flip positions. Always verify the market window matches current time.
6. **Never bet < 2 min before window close** — Bankr execution takes time, you'll miss the window.
7. **Killed Bankr calls still execute** — if you kill the local process, the server-side job continues. Always check positions after.
8. **Keep POL for gas** — Polymarket runs on Polygon. Keep ~$2 POL in Bankr wallet.

## Configuration

| Setting | Default | Notes |
|---------|---------|-------|
| Bet size | $3 | Per-bet USDC amount |
| Min score | 2 | Absolute score threshold to trigger bet |
| Candle source | Binance | 1-min BTCUSDT candles (60 candles) |
| Execution | Bankr CLI | Polygon USDC.e via bankr-submit.sh |
| Signal feed | `bets` | Net Protocol botchan feed name |
| Cron schedule | :08,:23,:38,:53 | 8 min into each 15-min window |

## Performance (Live Results)

**Feb 26, 2026 (Day 1 of fixed strategy):**
- Windows analyzed: 8
- Bets placed: 3 (37.5% selectivity)
- Won: 2 ✅ (11:15 AM UP, 12:00 PM UP)
- Lost: 0
- Skipped correctly: 5
- Revenue: ~$6 profit on $6 deployed

## Extending

- **Multi-asset:** ETH, SOL, XRP 15-min markets use same slug pattern (`eth-updown-15m-{ts}`, etc.)
- **Adaptive sizing:** Increase bet size when win streak > 3 or win rate > 60% over 20 bets
- **Cross-agent signals:** Other agents subscribe to `bets` feed and mirror trades
- **Bankr Signals integration:** Publish on-chain signal records for reputation building
