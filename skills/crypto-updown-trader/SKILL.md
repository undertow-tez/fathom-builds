---
name: crypto-updown-trader
description: Automated crypto Up/Down Polymarket betting strategy. Supports BTC, ETH, SOL, XRP on 5-min and 15-min markets. Analyzes short-term momentum (MA alignment, RSI, volatility, candle direction) and places selective bets via Bankr CLI when edge is detected. Configurable budget allocation, multi-asset support, and autonomous on/off machine architecture.
---

# Crypto Up/Down Trader (Multi-Asset)

Fully autonomous momentum strategy for Polymarket's "Up or Down" markets. Runs as an independent machine you turn on and off — separate from heartbeats or other agent activity. Supports multiple assets and timeframes.

## Supported Markets

| Asset | 15-min | Slug Pattern |
|-------|--------|-------------|
| BTC | ✅ | `btc-updown-15m-{ts}` |
| ETH | ✅ | `eth-updown-15m-{ts}` |
| SOL | ✅ | `sol-updown-15m-{ts}` |
| XRP | ✅ | `xrp-updown-15m-{ts}` |

**All markets:** Ties resolve UP ("greater than or equal to" = UP wins). This is a structural edge.

**Note:** Polymarket also has 5-min and daily markets, but this skill focuses on 15-min windows — the sweet spot between signal quality and trade frequency. 5-min is too noisy, daily is too slow for compounding.

## Architecture: The Machine

This strategy runs as **isolated cron jobs** — completely independent from your heartbeat or other agent activity. Think of it as a machine with an on/off switch.

```
┌─────────────────────────────────────────┐
│         Crypto Up/Down Machine          │
│                                         │
│  Cron jobs ──→ cycle.sh ──→ bet.sh ──┐  │
│  (per window)    │          │        │  │
│                  ▼          ▼        ▼  │
│            strategy.js   bankr    signal│
│            (analyze)     (bet)    (net) │
│                                         │
│  config.json = all settings             │
│  Lock files = no duplicate bets         │
└─────────────────────────────────────────┘
```

**Key principle:** Heartbeats and other crons should NOT run betting logic. Only dedicated cron jobs touch the strategy. Lock files prevent duplicates as a safety net.

## Performance (Live Testing)

**Based on live testing (Mar 2026):**
- **All-time win rate:** 64%
- **Midday (11 AM-2 PM ET) win rate:** 12.5% — **blackout recommended**
- **Optimal hours:** 9-11 AM ET, 3-5 PM ET (65-70% win rate)
- **UP bets:** 68% win rate (tie edge working)
- **DOWN bets:** 45% win rate (strict qualification needed)

## Quick Setup (For Agents)

When a user says something like *"I want to use $100 from my bankr wallet for the next 6 hours on BTC and ETH"*, here's what you do:

### Step 1: Configure

Edit `config.json`:
```json
{
  "asset": "btc",
  "assets": ["btc", "eth"],
  "timezone": "America/New_York",
  "timeframe": "15m",
  "budget": 100,
  "budgetDurationHours": 6,
  "betSize": null,
  "minScore": 3,
  "maxScore": null,
  "upOnly": false,
  "blackoutHours": [11, 12, 13],
  "drawdownLimit": 15,
  "cooldownMinutes": 30,
  "signalFeed": "bets",
  "broadcastSignals": true
}
```

**Multi-asset mode:** When `assets` array is set, it overrides the single `asset` field. Each asset runs independently — one cycle checks all assets and places bets for any that qualify.

**Budget calculation:** When `budget` + `budgetDurationHours` are set:
- $100 over 6h on 15m markets = 24 windows × 30% selectivity ≈ 7 bets → **~$14/bet per asset**
- With 2 assets, that's ~14 total bets across both → **~$7/bet**

If `betSize` is set directly (not null), it overrides the budget calculation.

### Step 2: Set up environment
```bash
export BANKR_API_KEY="your-bankr-api-key"
export PRIMARY_PRIVATE_KEY="0x..."  # For signal broadcasts (optional)
```

### Step 3: Test
```bash
node strategy.js --asset eth --timeframe 15m --dry-run
```

### Step 4: Create cron jobs (the machine)

**For 15-minute markets** — 4 jobs firing at :08, :23, :38, :53:
```
Job 1: "ETH 15m Cycle :08"
  schedule: cron "8 * * * *" tz=America/New_York
  sessionTarget: isolated
  payload: agentTurn
  message: "Run crypto up/down cycle: cd /path/to/scripts && bash cycle.sh --asset eth --timeframe 15m --bet-size 1.72"
  timeoutSeconds: 120
  delivery: announce

Job 2: same with expr "23 * * * *"
Job 3: same with expr "38 * * * *"
Job 4: same with expr "53 * * * *"
```

### Step 5: Turn it on
Enable the cron jobs. That's it — the machine runs.

## Turning It On / Off

### Turn OFF
```
cron update jobId=<id> patch={enabled: false}
```
Do this for all the cron jobs in the machine.

### Turn ON
```
cron update jobId=<id> patch={enabled: true}
```

### Check status
```
cron list
```

**When your user says "turn on/off the [asset] machine" — just toggle the cron jobs. Nothing else.**

## Budget Examples

| Request | Config | Result |
|---------|--------|--------|
| "$50 on BTC, 24 hours" | budget:50, hours:24, tf:15m | ~$1.72/bet, 29 expected bets |
| "$100 on ETH, 1 week" | budget:100, hours:168, tf:15m | ~$0.50/bet, 202 expected bets |
| "$20 on SOL, 6 hours" | budget:20, hours:6, tf:15m | ~$2.78/bet, 7 expected bets |
| "$30 on BTC, 12 hours" | budget:30, hours:12, tf:15m | ~$2.78/bet, 11 expected bets |

Budget math: `totalWindows = (hours × 60 / timeframe_minutes)`, `expectedBets = totalWindows × 0.3` (30% selectivity), `betSize = budget / expectedBets`

## Strategy Scoring

The momentum analyzer scores -5 to +5 based on:

| Factor | Weight | Description |
|--------|--------|-------------|
| MA Alignment | ±2 | MA5 vs MA10 vs MA20 trend direction |
| Candle Direction | ±1.5 | Last 5 candles up/down ratio (4-5 same = strong) |
| RSI Zone | ±1 | Overbought >70 contrarian, oversold <30 bounce, mild zones ±0.5 |
| Low Volatility | +1 | Low vol = ties more likely = UP edge |
| Volume Rising | 1.2x | Multiplies score when recent volume > prior |

**Decision thresholds:**
- |score| ≥ 3 → BET (HIGH confidence)
- |score| ≥ minScore (default 3) → BET (MEDIUM confidence)
- |score| < minScore → NO_BET (skip)
- score > maxScore (if set) → NO_BET (momentum trap filter)

Positive = UP, negative = DOWN. ~60-70% of windows get skipped. **Selectivity IS the edge.**

Expected win rate: ~64% (live tested). At ~2x payout, that's highly profitable over time.

## Advanced Filters (Based on Live Performance)

### 1. Hourly Trend Filter

Uses the full 60-minute candle history to check higher timeframe context:
- If hourly trend is DOWN >0.5% AND score is positive → **kill the UP signal** (don't bet UP into falling market)
- If hourly trend is UP >0.5% AND score is positive → **boost score by +0.5** (trend confirmation)
- If hourly trend is DOWN >0.5% AND score is negative → **confirm bearish** (no action needed)

**Why it works:** Short-term momentum can fake bullish while the broader trend is down. This prevents "catching falling knives."

### 2. DOWN Bet Qualification (Strict)

DOWN bets face a structural disadvantage: **ties resolve UP**. So DOWN only qualifies when ALL conditions met:
1. Score ≤ -4 (strong bearish)
2. Hourly trend down >0.5% (trend confirmed)
3. Volatility >0.05% (price moving, ties unlikely)
4. RSI 30-45 (bearish but not oversold bounce risk)

If any condition fails, the DOWN signal is **filtered to NO_BET** with explanation logged.

**Live result:** This brought DOWN bet win rate from 20% → 45% by eliminating low-probability setups.

### 3. Midday Blackout (11 AM-2 PM ET)

**Historically 12.5% win rate during midday.** The strategy now skips betting during configurable `blackoutHours` (default `[11, 12, 13]` ET).

**Why midday sucks:**
- Lower volume (lunch lull)
- Choppy, directionless price action
- Momentum indicators give false signals

**How to configure:** Set `blackoutHours` in config.json to hours in 24-hour format. **Blackout hours are always evaluated in US Eastern Time** because the crypto market dead zone is driven by US equity lunch hours — this applies globally regardless of the user's timezone. Set `timezone` to the human's local timezone (e.g., `Europe/London`, `America/Los_Angeles`, `Asia/Tokyo`) for display/reporting times. Empty array `[]` disables the blackout.

### 4. Score Cap Filter (Momentum Trap Protection)

High scores (>5) historically win only **33%** — they signal momentum exhaustion, not continuation.

Set `maxScore` in config (e.g., `5`) to filter out excessively bullish/bearish signals. When `score > maxScore`, decision becomes `NO_BET` with reason logged.

**Default:** `null` (no cap). Recommended: `5` for conservative mode.

### 5. Drawdown Protection

If net daily loss exceeds `drawdownLimit` (default $15), the strategy **pauses for the rest of the day**.

Calculation: `net P&L = (wins × $amount × 0.9) - (losses × $amount)`

This prevents "tilt trading" after a bad streak and protects bankroll.

### 6. Cooldown After Losses

After **2 consecutive losses**, the strategy pauses for `cooldownMinutes` (default 30) to avoid trading into continued adverse conditions.

Cooldown resets after a win or time expiration.

## Market Discovery

### Slug-Based Lookup (Only Correct Method)

```python
from datetime import datetime, timezone, timedelta

asset = "eth"  # btc, eth, sol, xrp
tf = "15m"     # 5m, 15m
tf_minutes = 15

et = timezone(timedelta(hours=-5))
now_et = datetime.now(timezone.utc).astimezone(et)
window_min = (now_et.minute // tf_minutes) * tf_minutes
window_start = now_et.replace(minute=window_min, second=0, microsecond=0)
ts = int(window_start.astimezone(timezone.utc).timestamp())
slug = f"{asset}-updown-{tf}-{ts}"
```

```bash
curl -s "https://gamma-api.polymarket.com/markets?slug=${slug}"
```

### ⚠️ DO NOT use:
- ❌ `events` endpoint — returns wrong day's markets
- ❌ Generic market search — doesn't surface short-term markets
- ❌ Title text search — unreliable

### Market Timing (15m)

| Time | What Happens |
|------|-------------|
| :00/:15/:30/:45 | Window opens |
| :07-:10 | Market spawns on API |
| **:08/:23/:38/:53** | **Optimal bet time** |
| Last 2 min | Don't bet (Bankr too slow) |
| +5-10 min after close | Resolves via Chainlink |

## Duplicate Bet Prevention

`bet.sh` creates a lock file per asset+timeframe+window: `.lock_{asset}_{tf}_{timestamp}`

- Lock exists → skip (another process already bet)
- Auto-cleans after 1 hour
- Primary prevention: keep betting in cron jobs only

## Resolution & Redemption

```bash
curl -s "https://gamma-api.polymarket.com/markets?slug=${slug}"
```
- `"closed": true, "outcomePrices": "[\"1\", \"0\"]"` → UP won
- `"closed": true, "outcomePrices": "[\"0\", \"1\"]"` → DOWN won

Redeem via Bankr: `"Redeem my position on '[EXACT TITLE]' on Polymarket"`

## Scripts

| Script | Purpose | Key Args |
|--------|---------|----------|
| `cycle.sh` | Full cycle (crons call this) | `--asset btc --timeframe 15m --bet-size 3` |
| `bet.sh` | Place bet + signal + lock | `UP 3 "" "" btc 15m` |
| `strategy.js` | Momentum analyzer | `--asset eth --timeframe 5m --dry-run --stats --show-config` |
| `outcome-tracker.js` | Resolve bets + analytics | `--stats --by-score --by-hour --by-asset --by-direction --sigma` |

## Signal Broadcasting

Every bet broadcasts to Net Protocol `bets` feed:
```
🎯 Ethereum 15m | UP (score: 4.2) | $1.72 | [market title] | [timestamp]
```

Other agents read: `botchan read bets --limit 10 --json`

## Hard Rules (From Real Losses)

1. **ONE Bankr call per bet** — duplicates cost real money
2. **Signal BEFORE Bankr** — Bankr hangs 2-8 min
3. **Fire-and-forget** — bankr-submit.sh returns jobId, verify separately
4. **Slug-based lookup ONLY** — calculate from time, don't search
5. **Don't bet in last 2 min** — Bankr too slow
6. **Killed CLI ≠ killed job** — Bankr server-side continues
7. **Keep POL for gas** — ~$2 minimum
8. **Betting in cron jobs ONLY** — not heartbeats

## Six Sigma Integration (Performance Optimization)

This skill integrates with the six-sigma skill for continuous improvement via DMAIC.

### Setup
```bash
# Initialize a six sigma project for your trading
python3 /path/to/six-sigma/scripts/dmaic_init.py --process "crypto-updown-trader" --goal "Maximize win rate"
```

### Outcome Tracker

The outcome tracker closes the feedback loop — it resolves pending bets, logs wins/losses, and generates analytics:

```bash
# Resolve all pending bets and show summary
node scripts/outcome-tracker.js

# Full performance breakdown
node scripts/outcome-tracker.js --stats --by-score --by-hour --by-direction --by-asset

# Log metrics to six sigma project
node scripts/outcome-tracker.js --sigma
```

**Recommended:** Add `node outcome-tracker.js --sigma` to your cycle.sh so every cron cycle auto-tracks performance.

### Analytics Available

| Flag | Shows |
|------|-------|
| `--stats` | Overall win rate, PnL, selectivity, bet count |
| `--by-score` | Win rate broken down by score bucket (2-3, 3-4, 4+) |
| `--by-hour` | Win rate by hour of day (ET) — find your best trading hours |
| `--by-direction` | UP vs DOWN win rates — is the tie edge working? |
| `--by-asset` | Per-asset performance (BTC vs ETH vs SOL vs XRP) |
| `--sigma` | Logs metrics to six-sigma-projects for DMAIC tracking |

### What To Watch For

After 50+ bets, use the analytics to:

1. **Score calibration** — if score 2-3 bets win at 80% but score 3-4 only 50%, the middle range might be a trap. Adjust thresholds.
2. **Time-of-day bias** — if afternoons ET crush but mornings underperform, add time weighting to scores.
3. **Direction bias** — if DOWN bets consistently lose, consider UP-only mode (exploit tie-resolves-UP edge harder).
4. **Asset differences** — some assets may trend more predictably than others on short timeframes.

### Improvement Cycle

```
Run 50 bets → outcome-tracker --stats --by-score --sigma
  → Identify weakest bucket or pattern
  → Adjust strategy (threshold, time filter, direction bias)
  → Log change: improve.py --process crypto-updown-trader --change "description"
  → Run 50 more bets → compare before/after
  → Repeat
```

## CLI Reference

```bash
# Analyze any asset
node strategy.js --asset sol --timeframe 5m

# See config for an asset
node strategy.js --asset eth --timeframe 15m --show-config

# View stats
node strategy.js --asset btc --stats

# Dry run
node strategy.js --asset xrp --timeframe 15m --dry-run --bet-size 2
```

## Configuration (config.json)

```json
{
  "asset": "btc",              // btc, eth, sol, xrp (used if assets not set)
  "assets": ["btc"],           // Array for multi-asset (overrides asset if set)
  "timeframe": "15m",          // 5m, 15m
  "betSize": 5,                // Fixed $ per bet (null = use budget calc)
  "budget": null,              // Total budget in $ (enables auto-sizing)
  "budgetDurationHours": null, // How long to spread budget over
  "minScore": 3,               // Min |score| to trigger bet
  "maxScore": null,            // Max score cap (null = no cap, 5 recommended)
  "upOnly": false,             // true = never bet DOWN (exploit tie edge only)
  "timezone": "America/New_York", // Human's local timezone for display (IANA format)
  "blackoutHours": [11,12,13], // ET hours to skip (US market dead zone — always ET)
  "drawdownLimit": 15,         // Max daily loss $ before pause
  "cooldownMinutes": 30,       // Pause duration after 2 consecutive losses
  "signalFeed": "bets",        // Net Protocol feed name
  "broadcastSignals": true     // Post signals on-chain
}
```

### Field Details

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `asset` | string | `"btc"` | Single asset to trade (if `assets` not set) |
| `assets` | array | `["btc"]` | Multi-asset array (overrides `asset`) |
| `timeframe` | string | `"15m"` | Market window size (`5m` or `15m`) |
| `betSize` | number/null | `5` | Fixed bet amount (set to `null` to use budget calc) |
| `budget` | number/null | `null` | Total $ to allocate (requires `budgetDurationHours`) |
| `budgetDurationHours` | number/null | `null` | Hours to spread budget over |
| `minScore` | number | `3` | Minimum \|score\| required to bet |
| `maxScore` | number/null | `null` | Score cap to filter momentum traps (5 recommended) |
| `upOnly` | boolean | `false` | If `true`, never bet DOWN (exploit tie edge only) |
| `blackoutHours` | array | `[11,12,13]` | ET hours to skip (empty `[]` disables) |
| `drawdownLimit` | number | `15` | Max daily loss $ before stopping |
| `cooldownMinutes` | number | `30` | Minutes to pause after 2 consecutive losses |
| `signalFeed` | string | `"bets"` | Net Protocol feed name for signals |
| `broadcastSignals` | boolean | `true` | Broadcast bets on-chain |

### Recommended Configs

**Conservative (maximize win rate):**
```json
{
  "assets": ["btc"],
  "minScore": 4,
  "maxScore": 5,
  "upOnly": true,
  "blackoutHours": [10, 11, 12, 13, 14],
  "drawdownLimit": 10,
  "cooldownMinutes": 60
}
```

**Aggressive (maximize bet frequency):**
```json
{
  "assets": ["btc", "eth", "sol"],
  "minScore": 2,
  "maxScore": null,
  "upOnly": false,
  "blackoutHours": [],
  "drawdownLimit": 25,
  "cooldownMinutes": 15
}
```

**Balanced (live-tested default):**
```json
{
  "assets": ["btc"],
  "minScore": 3,
  "maxScore": null,
  "upOnly": false,
  "blackoutHours": [11, 12, 13],
  "drawdownLimit": 15,
  "cooldownMinutes": 30
}
```
