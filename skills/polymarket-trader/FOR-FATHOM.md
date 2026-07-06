# For Fathom: The New Trading Process

*Written by Claude Code for Fathom (and Hermes). Read this top to bottom before touching anything. It explains what changed, why, and exactly what you're being asked to run.*

---

## Division of labor (read this first)

Per Undertow: **both agents think at full capacity; decision authority is structured.**

- **Claude Code (Fable 5):** final call on strategy, code, config, and go/no-go decisions. Writes the analysis of record in `data/ANALYSIS.md` and answers every proposal you make — with reasoning, not by fiat.
- **Fathom (you):** you run the machinery — crons, health, data sync — AND you're the agent closest to the data, watching it accumulate in real time. Use that position fully: analyze `shadow.jsonl` yourself, form hypotheses, spot patterns and market-structure changes, propose improvements, and **challenge Claude's analysis when you think it's wrong** — dissent through the proper channel is a feature, not a violation.
- **The one hard line:** neither agent unilaterally changes running config, patches strategy code mid-sample, or enables live trading. Every change is decided in writing in `ANALYSIS.md`, then applied. This protects the experiment (and eventually the money) from *both* of us — it's the agent version of "don't trade your own tilt," not a capability ranking.

Channels:

- `data/NOTES.md` — operational log: observations, anomalies, station-description quotes, confirmations of applied changes. Keep observation and interpretation distinguishable ("BTC logged 0 entries 14:00–18:00 UTC [obs]; I suspect the cron env broke after reboot [read]") so Claude can verify the fact independently of the theory.
- `data/PROPOSALS.md` — yours too, for developed ideas: strategy tweaks, new filters, code changes, threshold arguments. Include your reasoning and the data behind it. Claude must respond to every entry in ANALYSIS.md with accept / decline / needs-more-data and the why. Accepted code changes get implemented by Claude on the branch; you pick them up on your next pull.
- Config edits still flow one way: decided and written as exact instructions in `ANALYSIS.md` → you apply verbatim → confirm in NOTES.md. (This applies to Claude's own ideas as much as yours — the decision must be on paper before hands touch the dial.)

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
| `data/NOTES.md` | Fathom | operational log: observations, anomalies, confirmations |
| `data/PROPOSALS.md` | Fathom | developed ideas with reasoning — every entry gets a reasoned reply |
| `data/ANALYSIS.md` | Claude Code | analysis of record, replies to notes & proposals, action items, config edicts |
| everything else (scripts, docs, config.example) | Claude Code | code and process changes |

Your loop (already covered by the cron jobs): run shadow cycles → sync daily → **after each sync, `git pull` and read `data/ANALYSIS.md`** — it may contain action items or fixes to pick up.

Claude Code's loop (scheduled sessions): pull the branch → verify and analyze the new data → reply to your NOTES.md entries → write findings and action items in ANALYSIS.md → push. Undertow sees both sides and arbitrates anything we disagree on.

If you need a code change (bug, new metric, config question): describe it in NOTES.md rather than patching scripts yourself — Claude Code picks it up on the next check-in. Exception: genuinely broken cron/paths on your machine, fix locally and note what you did.

In NOTES.md, keep the observation separable from your interpretation — give both, labeled. "London market description says: '…resolved based on Heathrow Airport…' — so config looks right" is perfect: Claude can verify the quote independently of your conclusion. Bigger ideas belong in PROPOSALS.md where they'll get a full reply.

## If something breaks

- `shadow-cycle.sh` exits silently → the `.enabled-shadow` flag is missing; that's the off switch, not a bug.
- "no open market found" for weather → check if Polymarket changed slug patterns (currently `highest-temperature-in-<city>-on-<month>-<day>-<year>`); update `slugPrefix` in config.
- Ensemble/API errors → cycles skip safely and retry next run; only investigate if it persists for a day.
- Anything else: don't patch scripts ad hoc — leave a note in the repo (commit a `data/NOTES.md` entry via sync) so Claude Code can fix it properly on the next session.

Questions about the design: `SKILL.md` is the full documentation; `references/weather-strategy.md` explains the weather math and its failure modes.
