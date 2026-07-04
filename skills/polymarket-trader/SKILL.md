---
name: polymarket-trader
description: Dual-strategy Polymarket trading skill for daily income via the Bankr wallet. Machine 1 trades crypto 15-min Up/Down markets (BTC/ETH/SOL/XRP) with a live-tested momentum strategy. Machine 2 trades daily highest-temperature weather markets by pricing buckets from forecast model ensembles (Open-Meteo) and betting only when the model disagrees with the market. Shared risk guards, P&L accounting, and Bankr redemption.
---

# Polymarket Trader (BTC 15m + Weather)

Two independent trading machines that share one wallet (Bankr), one bet log, one P&L tracker, and one daily loss limit. Turn each machine on and off separately. Designed to grind out **small daily income from many selective, positive-edge bets** — not to hit home runs.

```
┌────────────────────────────────────────────────────┐
│                 Polymarket Trader                  │
│                                                    │
│  BTC machine (cron :08/:23/:38/:53)                │
│    btc-cycle.sh → btc-strategy.js → bet.sh ─┐      │
│                                             │      │
│  Weather machine (cron 3-4x/day)            ▼      │
│    weather-cycle.sh → weather-strategy.js → Bankr  │
│                                             ▲      │
│  Shared: bets.jsonl • pnl.js • redeem-all.sh│      │
│          daily loss limit • lib/bankr.sh ───┘      │
└────────────────────────────────────────────────────┘
```

## Where the edge comes from

**Machine 1 — Crypto Up/Down (15-min):** Momentum persistence on 15-minute windows plus a structural edge: **ties resolve UP**. Scores MA alignment, candle direction, RSI, volatility, and volume; only bets when |score| ≥ 3 (~30% of windows). Live-tested at **64% all-time win rate** (see `skills/crypto-updown-trader` in this repo — this is a port of that strategy with all its post-mortem filters baked in: hourly trend filter, strict DOWN qualification, midday blackout, score cap).

**Machine 2 — Weather (highest temperature):** Polymarket runs daily "Highest temperature in {city}" markets with integer °F/°C buckets. The market is priced by retail flow; **weather model ensembles are a better probability estimator**, especially:
- **< 36h out** — ensemble spread collapses, but market prices lag.
- **Late in the target day** — the observed running max makes low buckets literally impossible; the strategy clamps its distribution on live NWS observations and buys the bucket the market is still underpricing.

The strategy computes each bucket's probability as the fraction of ~50 ensemble members (GFS + ECMWF) whose daily max lands in it, then bets YES or NO only when |model − market| ≥ `minEdge` (default 12 points). Most cycles it does nothing. **Selectivity IS the edge — for both machines.**

## Requirements

- `node` ≥ 18, `jq`, `curl`, `python3`
- Bankr access: either an installed bankr skill (its `bankr-submit.sh`/`bankr-status.sh` are auto-detected) or `BANKR_API_KEY` in the environment. Wallet needs USDC on Polygon + ~$2 POL for gas.

## Setup

```bash
cd skills/polymarket-trader
cp config.example.json config.json     # then edit

export BANKR_API_KEY="..."             # unless a bankr skill is installed

# Dry-run both machines (no bets placed)
bash scripts/machine.sh start all
bash scripts/btc-cycle.sh --dry-run
bash scripts/weather-cycle.sh --dry-run
```

### ⚠️ Verify weather resolution stations BEFORE enabling a city

Each Polymarket weather market resolves against **one specific weather station** named in the market description (e.g., NYC markets typically resolve to LaGuardia Airport). The shipped city entries are best-guess defaults with `"verified": false`. Before trading a city:

1. Open the market on Polymarket and read the resolution source in the description.
2. Confirm `obsStation`, `lat`/`lon` (use the station's coordinates, not downtown), and `unit` match.
3. Set `"verified": true` in config.json.

Betting against the wrong station is a guaranteed slow leak. `weather-strategy.js` prints a warning for unverified cities but does not refuse — verification is on you.

## Cron schedule (the machines)

Crons stay installed permanently; `machine.sh start/stop` toggles flag files the cycle scripts check. All jobs should be isolated sessions, not heartbeats.

**BTC machine — 4 jobs** (8 min into each 15-min window):
```
"8 * * * *"   bash /path/to/scripts/btc-cycle.sh
"23 * * * *"  bash /path/to/scripts/btc-cycle.sh
"38 * * * *"  bash /path/to/scripts/btc-cycle.sh
"53 * * * *"  bash /path/to/scripts/btc-cycle.sh
```

**Weather machine — 4 jobs** (after model runs land + a late obs-lock pass, times in the city's local zone; ET shown):
```
"30 7 * * *"   bash /path/to/scripts/weather-cycle.sh    # 00z models digested
"30 13 * * *"  bash /path/to/scripts/weather-cycle.sh    # 12z models arriving
"30 16 * * *"  bash /path/to/scripts/weather-cycle.sh    # afternoon obs firming up
"0 21 * * *"   bash /path/to/scripts/weather-cycle.sh    # late obs-lock pass
```

**Control:**
```bash
bash scripts/machine.sh start btc      # or weather, or all
bash scripts/machine.sh stop weather
bash scripts/machine.sh status
```

## Risk guards (all automatic)

| Guard | Scope | Default |
|-------|-------|---------|
| Daily loss limit | **shared across both machines** | stop all betting at −$20/day |
| Duplicate prevention | per market | lock file + bets.jsonl check — one bet per market, ever |
| Midday blackout | BTC | skip 11 AM–2 PM ET (12.5% historical WR) |
| Cooldown | BTC | 2 consecutive losses → pause 30 min |
| Score cap | BTC | \|score\| > 5 → skip (momentum trap) |
| DOWN qualification | BTC | DOWN needs score ≤ −4, hourly confirm, vol, RSI 30–45 |
| Last-2-min cutoff | BTC | never bet with <2 min left (Bankr too slow) |
| Per-city / per-day caps | Weather | 1 bet/city/day, 4 weather bets/day |
| Price bounds | Weather | never buy above 85¢ or below 3¢ |
| Ensemble sanity | Weather | skip if <15 members returned |

## Daily income framing

Realistic expectations with defaults ($5 BTC bets, $10 weather bets):
- BTC: ~10–15 qualifying windows/day at 64% WR ≈ **+$3–8/day** expected
- Weather: 0–4 bets/day at a genuine 10–15 pt edge ≈ **+$2–6/day** expected, lumpier
- Bad days happen; the shared loss limit caps them at −$20. Do not raise stakes until 50+ resolved bets confirm the win rate at your sizes. Track with:

```bash
node scripts/pnl.js            # all-time, per strategy
node scripts/pnl.js --today
```

## Scripts

| Script | Purpose |
|--------|---------|
| `btc-cycle.sh` | BTC machine full cycle (guards → analyze → bet) |
| `btc-strategy.js` | Momentum analyzer + market slug lookup, `--dry-run` safe |
| `weather-cycle.sh` | Weather machine full cycle |
| `weather-strategy.js` | Ensemble vs market edge finder (analysis only, never bets) |
| `bet.sh` | Generic Bankr bet: lock → submit → log → confirm shares |
| `redeem-all.sh` | Sweep unresolved bets, redeem winners via Bankr |
| `pnl.js` | Real P&L from bets.jsonl (`--today`, `--json`) |
| `machine.sh` | `start\|stop\|status [btc\|weather\|all]` |
| `lib/bankr.sh` | Bankr submit/status/poll (skill scripts or REST fallback) |

## Hard rules (paid for with real losses)

1. **ONE Bankr call per bet.** Killed CLI ≠ killed job — Bankr keeps executing server-side. Never resubmit on timeout; verify first.
2. **Fire-and-forget.** Submit, capture jobId, verify in background. Bankr can hang 2–8 min.
3. **Slug-based market lookup ONLY.** Never search by title; never use the events list for up/down markets.
4. **Betting lives in cron jobs only.** Heartbeats and chat sessions must never place bets.
5. **Keep ~$2 POL for gas** or redemptions fail silently.
6. **Weather: verify the resolution station** before enabling a city (see above).
7. **Never bet the last 2 minutes** of a 15-min window.

## References

- [`references/weather-strategy.md`](references/weather-strategy.md) — bucket resolution mechanics, ensemble math, worked example, failure modes
- [`../crypto-updown-trader/`](../crypto-updown-trader/) — original BTC strategy with full performance history and six-sigma integration

## Disclaimers

This is real-money automated trading. Past win rates don't guarantee future results; weather markets are thinner than crypto markets and slippage via Bankr's market orders can eat small edges. Start with minimum sizes, verify every city, and keep the daily loss limit tight.
