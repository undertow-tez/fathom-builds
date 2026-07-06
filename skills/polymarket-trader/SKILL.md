---
name: polymarket-trader
description: Dual-strategy Polymarket trading skill for daily income via the Bankr wallet. Machine 1 trades crypto 15-min Up/Down markets (BTC/ETH/SOL/XRP) with a live-tested momentum strategy. Machine 2 trades daily highest-temperature weather markets by pricing buckets from forecast model ensembles (Open-Meteo) and betting only when the model disagrees with the market. Includes a shadow mode that proves (or kills) each strategy on real prices before money moves. Shared risk guards, P&L accounting, and Bankr redemption.
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

# Start the proving phase (no bets placed — see Proving protocol below)
bash scripts/machine.sh start shadow
bash scripts/shadow-cycle.sh           # run once manually to sanity-check
node scripts/shadow-score.js
```

## Proving protocol (START HERE — this is not optional ceremony)

Prediction markets are zero-sum minus costs. A strategy earns the right to real money by proving positive EV on real prices — win rate alone is meaningless (UP shares cost 53–55¢ because the tie edge is already priced in; a 58% win rate can be break-even). The protocol:

**Phase 0 — Shadow everything (2–4 weeks).** `machine.sh start shadow` + the shadow crons below. Every would-be bet is logged with its live entry price, auto-resolved, and scored. No money moves.

```bash
node scripts/shadow-score.js     # EV per $, calibration, verdicts
```

**Phase 1 — Weather live at minimum size** ($5 default), once weather shadow shows positive EV over ≥50 resolved bets. Run shadow in parallel forever — comparing live fills (bets.jsonl) vs shadow quotes (shadow.jsonl) measures exactly what Bankr execution costs you.

**Phase 2 — BTC live only at n≥200.** The historical 64% WR came from ~50 bets (95% CI roughly 50–77%) and its filters were fit on that same sample. The BTC machine stays in shadow until 200 resolved shadow bets show EV ≥ +5¢/$. If they don't: kill it without sentiment. `shadow-score.js` enforces these thresholds (configurable under `"proving"`).

**Phase 3 — Direct CLOB execution** (see [`references/clob-execution.md`](references/clob-execution.md)). The weather obs-clamp edge is time-sensitive; Bankr's 2–8 min latency and market orders burn a large share of it. If phase 1 shows a real but slippage-eroded edge, this is the highest-value build.

Realistic ceiling even when everything proves out: **$5–15/day at defensible sizes** — weather books are thin, so a proven edge means adding cities, not size. Bad days are capped by the shared loss limit, not eliminated.

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

**Shadow machine — same schedules, no money** (this is where every deployment starts):
```
"8,23,38,53 * * * *"  bash /path/to/scripts/shadow-cycle.sh --btc
"30 7 * * *"          bash /path/to/scripts/shadow-cycle.sh --weather
"30 13 * * *"         bash /path/to/scripts/shadow-cycle.sh --weather
"30 16 * * *"         bash /path/to/scripts/shadow-cycle.sh --weather
"0 21 * * *"          bash /path/to/scripts/shadow-cycle.sh --weather
"15 22 * * *"         bash /path/to/scripts/sync-data.sh    # publish data to the branch daily
```

`sync-data.sh` commits shadow/live logs + the scoreboard to `data/` on the branch, so analysis (human or Claude Code session) can happen anywhere without access to this machine.

**Control:**
```bash
bash scripts/machine.sh start shadow   # phase 0 — start here
bash scripts/machine.sh start weather  # phase 1 — only after shadow verdict ✅
bash scripts/machine.sh stop btc       # any of btc|weather|shadow|all
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
| Suspect-edge guard | Weather | edge > 35 pts = probably OUR error (wrong station, stale quote) — never traded, shadow-logged for diagnosis |
| Ensemble sanity | Weather | skip if <15 members returned |

## Tracking

```bash
node scripts/pnl.js              # real P&L, all-time, per strategy
node scripts/pnl.js --today
node scripts/shadow-score.js     # hypothetical EV/$, calibration, go-live verdicts
```

Judge strategies on **EV per dollar staked at entry prices**, never on win rate. `shadow-score.js` also reports weather model calibration (when it said 80%, did it happen 80%?) and can test whether the BTC blackout filter is real (`--include-flagged`).

## Scripts

| Script | Purpose |
|--------|---------|
| `shadow-cycle.sh` | Shadow machine: log would-be bets at real prices, no money |
| `shadow-score.js` | Resolve + score shadow bets: EV/$, calibration, verdicts |
| `btc-cycle.sh` | BTC machine full cycle (guards → analyze → bet) |
| `btc-strategy.js` | Momentum analyzer + market slug lookup, `--dry-run` safe |
| `weather-cycle.sh` | Weather machine full cycle |
| `weather-strategy.js` | Ensemble vs market edge finder (analysis only, never bets) |
| `bet.sh` | Generic Bankr bet: lock → submit → log → confirm shares |
| `redeem-all.sh` | Sweep unresolved bets, redeem winners via Bankr |
| `pnl.js` | Real P&L from bets.jsonl (`--today`, `--json`) |
| `machine.sh` | `start\|stop\|status [btc\|weather\|shadow\|all]` |
| `sync-data.sh` | Daily: publish shadow/live logs + reports to the branch |
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
- [`references/clob-execution.md`](references/clob-execution.md) — phase 3 roadmap: direct CLOB limit orders to stop paying Bankr latency/slippage
- [`../crypto-updown-trader/`](../crypto-updown-trader/) — original BTC strategy with full performance history and six-sigma integration

## Disclaimers

This is real-money automated trading. Past win rates don't guarantee future results; weather markets are thinner than crypto markets and slippage via Bankr's market orders can eat small edges. Start with minimum sizes, verify every city, and keep the daily loss limit tight.
