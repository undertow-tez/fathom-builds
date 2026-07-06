# For Fathom: The New Trading Process

*Written by Claude Code for Fathom (and Hermes). Read this top to bottom before touching anything. It explains what changed, why, and exactly what you're being asked to run.*

---

## What this is

A new skill (`skills/polymarket-trader/`) that will eventually trade two Polymarket strategies with real money through the Bankr wallet:

1. **BTC 15-min Up/Down** — your existing momentum strategy, ported with all its filters
2. **Weather** — daily highest-temperature markets, priced from GFS+ECMWF forecast ensembles

**But not yet.** Right now there is exactly one job: run the **shadow machine** — a dry-run mode that logs every bet the strategies *would* make, at real market prices, and scores them against real outcomes. No Bankr calls. No money. No keys needed.

## Why we're doing it this way

Your own dry-run history (see `skills/crypto-updown-trader/references/btc-all-dry-runs-aggregate.md`) was analyzed on 2026-07-07. The verified findings:

- **37 resolved trades, +$17.98.** Sounds good, but the 95% confidence interval on the per-dollar return is **−31¢ to +49¢** — statistically indistinguishable from no edge or a losing strategy.
- **All profit came from one weekend** (June 22–23, mostly DOWN bets). The current config (`allow_down=False`, running since June 24) has **never been profitable in dry-run** (17 trades, −1.3¢/$).
- **The model is ~11 points overconfident.** It predicted 57% average win probability and delivered 46%. The claimed 14-point average "edge" is mostly this bias. The only calibrated region was predictions ≥60% (predicted ~70%, delivered 67%).
- One trade claimed **92.5% confidence** on a 15-minute coin flip and lost.

Lesson: we do not trust any strategy — including ones with good-looking history — until it proves positive EV per dollar over a real sample. That's what shadow mode measures.

## Your setup checklist (one time, ~5 minutes)

```bash
cd <repo>
git fetch origin && git checkout claude/polymarket-trading-skill-qyavzy && git pull
cd skills/polymarket-trader
cp config.example.json config.json
bash scripts/machine.sh start shadow
bash scripts/shadow-cycle.sh          # smoke test: expect strategy output + 👻 lines
node scripts/shadow-score.js          # expect: "keep shadowing — 0/200"
```

Then install these cron jobs (isolated jobs, NOT in heartbeats — same rule as always):

```
8,23,38,53 * * * *   bash <abs-path>/scripts/shadow-cycle.sh --btc
30 7 * * *           bash <abs-path>/scripts/shadow-cycle.sh --weather
30 13 * * *          bash <abs-path>/scripts/shadow-cycle.sh --weather
30 16 * * *          bash <abs-path>/scripts/shadow-cycle.sh --weather
0 21 * * *           bash <abs-path>/scripts/shadow-cycle.sh --weather
15 22 * * *          bash <abs-path>/scripts/sync-data.sh
```

The last job publishes `shadow.jsonl` + scoreboard reports into `data/` on this branch daily. That is how Claude Code and Undertow see progress without access to your machine. If a push fails it retries the next day — don't babysit it.

## Rules while the shadow runs

1. **Do not enable the live machines.** `machine.sh start btc` / `start weather` stay OFF until the scoreboard verdict says otherwise. The verdict is printed by `node scripts/shadow-score.js` and enforced by thresholds in config: weather needs **50 resolved bets**, BTC needs **200**, both need **EV ≥ +5¢ per $1**.
2. **Do not change config.json mid-sample.** Your June history had 3 config eras in 18 days, which meant no era ever accumulated a judgeable sample. The config is frozen until a verdict. If something looks broken, fix bugs, not thresholds.
3. **Do not "fix" a losing streak.** Losing streaks are expected inside a proving run; that's the point of running it with fake money.
4. **Betting logic stays in these cron jobs only.** Never place Polymarket bets from heartbeats or chat sessions, shadow or otherwise.

## Your one side task: verify weather stations

Each weather market resolves at ONE named station (it's in the market description on Polymarket). Wrong station = guaranteed slow leak. Status:

| City | Config assumes | Status |
|------|---------------|--------|
| NYC | LaGuardia (KLGA) | ✅ verified 2026-07-06 against live market description |
| Chicago | Midway (KMDW) | ❓ verify, then set `"verified": true` in config.json |
| Miami | Miami Intl (KMIA) | ❓ verify, then set `"verified": true` |
| London | Heathrow | ❓ verify, then set `"verified": true` |

To verify: open any active `highest-temperature-in-<city>` market, read the resolution source in its description, confirm it names the station in the table (and that `lat`/`lon` in config.json point at that station). If it names a different station, update `obsStation`, `lat`, `lon` accordingly *before* setting verified — this is the one config change that IS allowed mid-sample, because unverified cities aren't part of the frozen experiment yet.

## What the shadow machine does (so you can sanity-check it)

- **BTC, every 15 min:** momentum score from 1-min candles → if it would bet, looks up the live market, records direction + the actual current share price. Bets during blackout hours (11–13 ET) are logged with a `blackout` flag instead of skipped — so the data will tell us whether the blackout filter is real or overfit.
- **Weather, 4x/day:** pulls ~80 ensemble members per city, converts to bucket probabilities, compares to market prices. Only logs a recommendation when the edge ≥ 12 points. Edges > 35 points are flagged `suspect-edge` and would never be traded live — a confident market disagreeing that hard usually means OUR station/config/model is wrong, not free money. (Your 92.5%-confidence loss is the pattern this catches.)
- **Scoring, automatic:** every cycle resolves finished markets and updates the ledger. `node scripts/shadow-score.js` prints EV per dollar, model calibration (predicted vs realized), and the go/no-go verdict.

## What happens after

- **Weather passes** → weather machine goes live at $5 bets (needs `BANKR_API_KEY` at that point, and only verified cities). Shadow keeps running in parallel forever — live fills vs shadow quotes measures what Bankr execution costs us.
- **BTC passes** → BTC machine goes live small.
- **Either fails at full sample** → it gets killed or retuned and re-proven. No sentiment.
- **Weather passes but slippage eats the edge** → we build direct CLOB execution (`references/clob-execution.md`) instead of raising stakes.

## If something breaks

- `shadow-cycle.sh` exits silently → the `.enabled-shadow` flag is missing; that's the off switch, not a bug.
- "no open market found" for weather → check if Polymarket changed slug patterns (currently `highest-temperature-in-<city>-on-<month>-<day>-<year>`); update `slugPrefix` in config.
- Ensemble/API errors → cycles skip safely and retry next run; only investigate if it persists for a day.
- Anything else: don't patch scripts ad hoc — leave a note in the repo (commit a `data/NOTES.md` entry via sync) so Claude Code can fix it properly on the next session.

Questions about the design: `SKILL.md` is the full documentation; `references/weather-strategy.md` explains the weather math and its failure modes.
