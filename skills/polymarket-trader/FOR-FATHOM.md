# For Fathom: The New Trading Process

*Written by Claude Code for Fathom (and Hermes). Read this top to bottom before touching anything. It explains what changed, why, and exactly what you're being asked to run.*

---

## Division of labor (read this first)

Per Undertow: **Claude Code owns all thinking; you own all operating.**

- **Claude Code (Fable 5):** strategy design, code, analysis, interpretation of results, every config decision, every go/no-go call. If a number needs interpreting or a tradeoff needs weighing, it's Claude's.
- **Fathom (you):** run the cron jobs, keep the machine healthy, sync data, and **report observations without acting on them**. When you see something odd — a losing streak, a weird price, a market change, an idea for improvement — write it in `data/NOTES.md`. Do not patch code, do not tune config, do not draw conclusions from the data. Claude reads NOTES.md on every check-in and will either act or explain.
- **Config changes flow one way:** Claude writes the exact edit in `data/ANALYSIS.md` (e.g. "in config.json set `weather.cities.chicago.obsStation` to `KORD` and `verified` to `true`") → you apply it verbatim → you confirm in NOTES.md. You never originate a config change.

This isn't about trust — it's the same reason the strategies don't bet during their own losing streaks: separating the hands from the judgment is what keeps a money system safe.

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

To verify: open any active `highest-temperature-in-<city>` market and **copy the resolution-source sentence from its description into `data/NOTES.md`, verbatim, one entry per city.** That's the whole task — do not edit config.json yourself. Claude Code will check each station against the configured coordinates and write the exact config edits (if any) in `data/ANALYSIS.md` for you to apply.

## What the shadow machine does (so you can sanity-check it)

- **BTC, every 15 min:** momentum score from 1-min candles → if it would bet, looks up the live market, records direction + the actual current share price. Bets during blackout hours (11–13 ET) are logged with a `blackout` flag instead of skipped — so the data will tell us whether the blackout filter is real or overfit.
- **Weather, 4x/day:** pulls ~80 ensemble members per city, converts to bucket probabilities, compares to market prices. Only logs a recommendation when the edge ≥ 12 points. Edges > 35 points are flagged `suspect-edge` and would never be traded live — a confident market disagreeing that hard usually means OUR station/config/model is wrong, not free money. (Your 92.5%-confidence loss is the pattern this catches.)
- **Scoring, automatic:** every cycle resolves finished markets and updates the ledger. `node scripts/shadow-score.js` prints EV per dollar, model calibration (predicted vs realized), and the go/no-go verdict.

## What happens after

- **Weather passes** → weather machine goes live at $5 bets (needs `BANKR_API_KEY` at that point, and only verified cities). Shadow keeps running in parallel forever — live fills vs shadow quotes measures what Bankr execution costs us.
- **BTC passes** → BTC machine goes live small.
- **Either fails at full sample** → it gets killed or retuned and re-proven. No sentiment.
- **Weather passes but slippage eats the edge** → we build direct CLOB execution (`references/clob-execution.md`) instead of raising stakes.

## Collaboration protocol (how you and Claude Code operate as one)

The branch is our shared workspace. The rule that makes it safe: **every file has exactly one writer.**

| File | Writer | Purpose |
|------|--------|---------|
| `data/shadow.jsonl`, `data/bets.jsonl`, `data/*-report.txt` | Fathom (via `sync-data.sh`, daily) | raw results + scoreboards |
| `data/NOTES.md` | Fathom | observations, questions, station-verification findings, anything broken |
| `data/ANALYSIS.md` | Claude Code | verified analysis, replies to your notes, action items for you |
| everything else (scripts, docs, config.example) | Claude Code | code and process changes |

Your loop (already covered by the cron jobs): run shadow cycles → sync daily → **after each sync, `git pull` and read `data/ANALYSIS.md`** — it may contain action items or fixes to pick up.

Claude Code's loop (scheduled sessions): pull the branch → verify and analyze the new data → reply to your NOTES.md entries → write findings and action items in ANALYSIS.md → push. Undertow sees both sides and arbitrates anything we disagree on.

If you need a code change (bug, new metric, config question): describe it in NOTES.md rather than patching scripts yourself — Claude Code picks it up on the next check-in. Exception: genuinely broken cron/paths on your machine, fix locally and note what you did.

Your NOTES.md entries are most useful as **raw observations, not conclusions**: "BTC shadow logged 0 entries between 14:00–18:00 UTC, cron log attached" beats "the BTC machine seems broken"; "London market description says Heathrow" beats "London is verified." Claude does the interpreting — that's the division of labor.

## If something breaks

- `shadow-cycle.sh` exits silently → the `.enabled-shadow` flag is missing; that's the off switch, not a bug.
- "no open market found" for weather → check if Polymarket changed slug patterns (currently `highest-temperature-in-<city>-on-<month>-<day>-<year>`); update `slugPrefix` in config.
- Ensemble/API errors → cycles skip safely and retry next run; only investigate if it persists for a day.
- Anything else: don't patch scripts ad hoc — leave a note in the repo (commit a `data/NOTES.md` entry via sync) so Claude Code can fix it properly on the next session.

Questions about the design: `SKILL.md` is the full documentation; `references/weather-strategy.md` explains the weather math and its failure modes.
