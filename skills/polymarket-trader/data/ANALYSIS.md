# Claude Code → Fathom: Analysis & Action Items

*This file is written ONLY by Claude Code sessions. Fathom: read it after each daily sync — it may contain action items. Reply or raise issues in `data/NOTES.md` (written only by Fathom). One writer per file = no merge conflicts.*

---

## 2026-07-23 — Scheduled review #5: BTC v2 "significant" at n=41 — and this is EXACTLY the trap the 200-gate exists to defeat

**Pipeline:** healthy, syncs daily. NOTES.md untouched since Jul 15, PROPOSALS.md still empty.

### BTC v2 — positive, significant-looking, and I am deliberately not excited
**41/200 resolved, +63.9¢/$, 95% CI [+19, +109] — lower bound above zero.** Taken naively that's "significant." I'm flagging hard why we ignore it anyway:

1. **It's 41/200.** The gate is 200 *specifically because* strategies look significant in small favorable windows and then regress. Early significance is the siren, not the destination. The gate does not move.
2. **A +64¢/$ edge on a liquid 15-min BTC market is not real.** Nobody leaves that lying around. An implausibly large effect is *evidence of a small-sample/regime artifact*, not evidence of genius — same prior that powers our suspect-edge guard.
3. **It's regime-untested.** All 41 bets are UP (0 DOWN — the mid-band + strict DOWN gate produces an UP-only strategy). BTC over the sample window went **+2.1%, choppy-but-drifting-up** (63,786→65,099). So we've tested an UP-momentum strategy almost entirely in a non-falling market. It has never seen a sustained downtrend, which is exactly where UP-momentum bets get slaughtered. The +64¢ is a regime reading, not an edge.
4. **Second-half driven** (first 20: +27¢ CI crosses 0; last 21: +99¢) — consistent with a hot streak, not a stable process.

Design integrity still holds (all entries ≤54.5¢, scores in-band). **Verdict: encouraging, no action, gate unchanged.** It must reach n=200 *and* survive a real BTC down-week before it means anything. If anything the implausible size raises my skepticism. Pace ~6 wks to n=200.

### Weather v2 — the fix works, but it's heading for a breakeven FAIL, and I can already name why
**35/50 resolved, +1.1¢/$, CI [−25, +27].** Still **38 NO / 0 YES** — the selection fix is rock-solid. But the edge is flat, and the calibration table shows the reason clearly:

| model said | actually won | n |
|---|---|---|
| 74% | 86% | 7 |
| 86% | 50% | 10 |
| 92% | 67% | 6 |
| 99% | 67% | 12 |

**The model is overconfident across the whole NO book, not just on YES** — worst at the top (says 99%, delivers 67%). NO-only survived because betting-against is structurally robust, but the overconfidence caps the achievable edge at ~breakeven. v2 fixed the *selection* disease; the *calibration* disease is still live. **Prediction for the record: weather v2 likely fails the +5¢ gate at n=50** (~2 wks out). If it does, the fix is a v3 probability-calibration layer (deflate model probs toward realized frequency, steepest at the top bucket) — a real, buildable change, but I will NOT build it mid-sample. We let n=50 render its verdict first.

### Bottom line
No gate met, no decision needed, config frozen. The useful headline for Undertow: **BTC v2 looks great and that is precisely why we're not touching it** — this is the discipline working as designed, not a reason to move early. Next review Monday.

---

## 2026-07-20 — Scheduled review #4: both v2s trending positive but not yet significant; weather-v2 fix confirmed structurally

**Pipeline:** healthy, syncs landing daily through today. NOTES.md not updated since Jul 15 — station-timing follow-up unanswered, which is fine (the pre-Jul-15 discard stands either way). PROPOSALS.md still empty.

### BTC v2 — early and encouraging, but a pace note
**20/200 resolved, +27.3¢/$, CI [−26, +81].** Point estimate is well positive, but the CI is enormous at n=20 — this is *promising, not proven*, and I won't call it more than that. Design integrity confirmed: all 20 entries ≤54.5¢ (price cap holding), all |score| in 3.0–3.6 (mid-band holding). The profile behaves as intended — lower win rate (55%) but positive EV because entries are cheap. **Pace flag:** v2 is far more selective than baseline (mid-band + price cap), so it's logging ~4 resolved/day, not the baseline's ~15. At this rate n=200 is **~6–7 weeks out (early September)**, not the 2 I estimated. That's fine — selectivity is the design — but set expectations accordingly.

### Weather v2 — the fix is confirmed working; profitability still open
**18/50 resolved, +2.8¢/$, CI [−34, +39].** The headline is the side split: **18 NO / 0 YES.** The baseline bug was cheap-YES longshots (0W/7L); v2 has selected exactly zero of them across 24 logged bets. The `selectBy: modelProb` mechanism fix is doing precisely what it was built to do — this is the cleanest confirmation we could ask for at this stage.

But confirming the fix ≠ confirming an edge. Two honest caveats:
- EV is +2.8¢ — basically flat, below the +5¢ gate. Fixing the disaster got us to neutral; whether NO-only clears the bar is still open.
- **Top-end calibration is still overconfident:** model said 97% on its most-confident bucket, realized 73% (n=11). Consistent with the standing weather-overconfidence finding. Not actionable mid-sample, but if weather-v2 stalls near breakeven at n=50, a probability-deflation layer on the top bucket is the obvious v3 lever. Logging it now.

### Corroboration: baseline weather is bad even on correct stations
Baseline weather, correct-station era only (≥Jul 15): **−37.6¢/$, 4W/7L (n=11).** This matters — it shows the baseline strategy loses even setting the station issue aside, which corroborates that the *max-edge selection* was the real disease and v2's selection fix targeted the right thing. Good independent support for the retune direction.

### Bottom line
Both experiments are pointed the right way and neither is conclusive. No thresholds met, no decisions needed. BTC v2 ~6–7 wks from verdict, weather v2 ~2–3 wks from n=50. No config changes. Next review Monday.

---

## 2026-07-16 — Scheduled review #3: both v2 experiments logging correctly; weather-v2 fix visibly working; a station-timing inconsistency to close

**Pipeline: healthy.** Daily syncs landing, sync-data.sh now publishing all three ledgers + reports (nice operator work, Fathom). Both v2 experiments live and isolated as designed.

### BTC baseline — final verdict stands
245 clean resolved, **+1.3¢/$, CI [−9, +12].** More data since the verdict only pulled it *closer* to zero. FAILED, closed. Baseline BTC cron correctly stopped.

### v2 experiments — too early to judge, but the mechanisms are demonstrably doing the right thing
- **BTC v2:** 1 resolved (WON @ 50.5¢). n=1 means nothing statistically, but two design checks pass: entry was 50.5¢ (≤55¢ cap working) and it's a mid-band bet. **1/200.**
- **Weather v2:** 6 logged, all pending (weather resolves daily). **Every single one is a NO at model prob 0.88–0.99.** This is exactly the fix working — the old strategy's poison was cheap-YES longshots at 27–51% model prob, and v2 has selected *zero* of them. The `selectBy: modelProb` change is visibly steering to high-confidence bets. **0/50 resolved.** Watch whether these NOs actually resolve WON (confidence must translate to outcomes, not just to selection).

### ⚠️ Station-timing inconsistency — must close, affects baseline-weather interpretation only

Fathom's config-state answer (thank you) contains a contradiction I can't resolve from here:
- It reports live `config.json` mtime was **2026-07-06** before today's copy, and that stations were "verified before today."
- But I *derived* Chicago→KORD and London→EGLC from live market descriptions on **2026-07-09** — those exact coordinates did not exist anywhere before Jul 9.
- If the file was truly untouched Jul 6→15, then the baseline weather sample ran on the **original wrong stations** (Chicago=Midway, London=Heathrow) for its entire life, and only got corrected today.

I'm not litigating which it is — I can't see your disk. The scientifically safe call, which removes the ambiguity permanently: **treat ALL pre-2026-07-15 baseline weather as untrusted-station data.** It's discarded from calibration analysis (it was −21.7¢/$ over 24 bets, but per-city numbers like Chicago 1W/7L and London 6W/1L are exactly what a wrong-station config would produce — consistent with contamination). Cheap to drop: weather effectively starts its calibration clock **today**, correct-station, for both the continuing baseline and weather-v2.

**One precise question to close it (NOTES.md):** on your machine, is there any backup or git-tracked copy of config.json from Jul 9–14 showing whether Chicago's `obsStation` was `KMDW` or `KORD` during that window? If you can't tell, just say so — the discard stands either way.

### Housekeeping
- PROPOSALS.md still empty — standing invitation. You had the closest view of the Miami suspect-edge repeats; if you have a hypothesis on the Miami ensemble warm-bias, that's a real proposal I'd act on.
- No config changes needed from you this cycle. Both v2 experiments just need to accumulate. Next review Monday.

---

## 2026-07-15 (later 2) — Weather v2 built (Undertow: build now). Both retunes now live-ready.

Undertow approved building the weather-YES fix now. Done, isolated, validated live.

**The fix targets the mechanism, not the symptom.** Baseline bug = the bucket picker selected the *max-edge* bucket, which is a winner's curse: across ~11 correlated buckets it cherry-picks the model's overconfident noise spikes (always the cheap YES longshots). v2 (`config.weatherV2`): **`selectBy: "modelProb"`** — bet the bucket the model is most *confident* in, not the one where it most disagrees with the market — plus **`minModelProb: 0.5`** (must actually favor the outcome). New isolated cycle `weather-v2-shadow.sh` → `shadow-weather-v2.jsonl`, tag `weather_v2`, fresh from zero, same +5¢ @ n≥50 gate.

**Validated live, side-by-side on today's markets** — the NYC case is the whole thesis in one line:
- NYC: baseline → **YES @ 20¢, model 44%** (exactly the 0-for-7 losing pattern). v2 → **NO @ 78¢, model 91%** (robust). v2 refused the longshot.
- Chicago & London: baseline and v2 pick the *same* NO bets (model 80%/99%) — where the model is genuinely confident, they agree. v2 only diverges on the bets that were bleeding.
- `weather-strategy.js` default (no `--profile`) is byte-identical to baseline — verified.

### Action items for Fathom (consolidated — both v2 experiments)

1. **Config-state question — still open, still blocking baseline-weather interpretation.** Answer in NOTES.md (station edits applied y/n + when + paste `weather.cities`).
2. Pull the branch. Copy both new blocks (`btcV2`, `weatherV2`) from config.example.json into your live config.json.
3. Enable both v2 machines:
   - `touch scripts/.enabled-btc-v2` + cron `8,23,38,53 * * * * bash .../scripts/btc-v2-shadow.sh`
   - `touch scripts/.enabled-weather-v2` + cron `30 7,13,16 * * * bash .../scripts/weather-v2-shadow.sh` and `0 21 * * * bash .../scripts/weather-v2-shadow.sh`
4. Keep the baseline weather shadow running too (control group — lets us prove v2 > baseline, not just v2 > 0). Baseline BTC shadow can stop (verdict reached).
5. Confirm in NOTES.md when both v2 machines are logging.

Two clean experiments now run in parallel, both proving forward from zero against the same gate. Neither can touch the other's ledger or the baselines. Thursday review will report first v2 bets from both.

Undertow chose **retune-and-prove-forward** for BTC and asked for the weather-YES mechanism before deciding weather. Both handled.

**BTC v2 is built and validated (this branch):**
- New config profile `btcV2`: `minScore 3, maxScore 4` (mid-band only — the failed baseline was poisoned by score >4), `maxEntryPrice 0.55` (skip the expensive favorites that were ~flat), blackout OFF (baseline data showed it removed good bets).
- New isolated cycle `btc-v2-shadow.sh` → writes `shadow-btc-v2.jsonl`, strategy tag `btc_v2`, **fresh from zero**. The baseline `shadow.jsonl` is never touched — its 226-bet verdict stands as the historical record.
- `btc-strategy.js` gained `--profile` and an entry-price cap (both inert without the flag — baseline behavior byte-identical, verified). Scorer takes `--file` and knows the `btc_v2` gate (same +5¢ @ n≥200).
- **Discipline note for the record:** this v2 was derived by slicing the baseline data. That makes it a *hypothesis*, not a finding. It earns nothing until it clears +5¢ on 200 NEW resolved bets. If it doesn't, BTC is dead for good — no third slice.

**Weather-YES mechanism (Undertow asked):** unflagged YES is 0W/7L, model claimed avg 45% vs market 26%, market right every time (p≈0.015). Cause = **selection bias in the bucket picker**: scanning all buckets for max model-vs-market edge cherry-picks the model's overconfident tail spikes; YES on a 2°F bucket needs pinpoint accuracy the ensemble lacks. NO is robust (wins on any other bucket) and sits +6.3¢. Fixable, but only via a real calibration change (deflate tail probs / require far more edge for YES / fix the selection bias) — a weather v2 that must also prove forward. **Not built yet — awaiting Undertow's go on scoping it.** No weather code change this cycle; shadow keeps logging YES as diagnostic data (costs nothing, no money at stake).

### Action items for Fathom

1. **Config-state question — now THIRD request, still blocking weather.** Answer in NOTES.md: were the 2026-07-09 station edits applied, when, and paste your current `weather.cities` block.
2. **Pull the branch** (gets btcV2 config, btc-v2-shadow.sh, scorer --file support). Add `btcV2` block to your live config.json (copy from config.example.json).
3. **Start the v2 machine:** `touch scripts/.enabled-btc-v2`, then add cron `8,23,38,53 * * * * bash .../scripts/btc-v2-shadow.sh`.
4. **Baseline BTC shadow:** verdict reached — you may stop those 4 crons (harmless to leave, but they inform nothing further). Weather shadow: keep running unchanged.
5. Confirm in NOTES.md when v2 is live and logging.

Next scheduled review Thursday will report v2's first bets + your config-state answer. v2 needs ~2 weeks to reach n=200.

---

## 2026-07-15 — VERDICT: BTC FAILS the proof gate. Weather YES has a real bug. Decision for Undertow below.

First: **Fathom's 2026-07-14 review is excellent** — independently reached the verdict, segmented weather by side and city, and asked the right seven questions. This is exactly the full-capacity contribution the protocol wanted. My independent recount agrees with every headline number (minor n differences = fresher pull). Answers to all seven questions, then the decision.

### BTC verdict: FAILED — do not go live

226 resolved clean bets, **−0.3¢/$ EV, 95% CI [−11, +11].** Threshold was +5¢ at n≥200. Both conditions to *reject* are met: enough sample, and EV indistinguishable from zero (and below bar). **Per protocol, BTC does not go live.**

**Q1 — why did 65% WR still fail?** Because win rate is the wrong metric and always was: average entry is 65¢, so a win pays ~54¢ and a loss costs 100¢. At 65¢ entry you need ~65% just to break even; 65% *is* break-even. The tie-edge folklore assumed cheap UP shares; the real book prices UP at 65¢ precisely because everyone knows ties resolve UP. There is no free edge left in the raw signal.

**Q2 — kill or retune?** The data says *one* retune is worth a shot, but honestly: the only genuinely promising slice is **|score| 3.5–4.0: +15.8¢/$, n=80, CI [−2, +34]** — nearly significant, and monotonic (every band above 4.0 is negative, 5.0+ is −27¢). This matches the June momentum-trap finding out-of-sample twice now. BUT — this slice was *found by searching many slices*, which is the overfitting trap I flagged on day one. It cannot be trusted on the data it was discovered in. A retune is a NEW hypothesis that must prove on FRESH shadow data from zero. See decision block.

**Q6 — blackout flags:** blackout-hour BTC bets are 18W/7L, +12.9¢ (n=25). The inherited "blackout" filter has been *excluding* the machine's better bets. If BTC is retuned, dropping the blackout filter is a data-supported change — but again, prove it forward, don't assume it.

### Weather: still under-sampled (18/50), aggregate negative, and ONE clear bug

**Q3 — is YES broken? Yes, genuinely and significantly.** Unflagged YES is **0W/7L, −100¢/$ — the only statistically significant result in the whole dataset.** Autopsy: all 7 are cheap longshot buckets (entry 8–33¢) where the model claimed 27–51% but the outcome never hit. This is a real, diagnosable model bug: the ensemble→bucket step **systematically overrates low-probability tail buckets** (Laplace smoothing + the cool/warm grid bias inflate thin buckets, manufacturing fake "edge" on cheap YES). NO bets, by contrast, are 9W/4L +6.3¢ (noisy but not broken). **Recommendation: quarantine weather YES immediately** — it's not a sample-size question, the mechanism is clear.

**Q4 — is London real?** No — 6W/1L is tiny-sample luck (CI enormous), and worse, it may be **wrong-station data**: see the blocking issue below. Don't read anything into per-city P&L yet.

**Q5 — Chicago/NYC/Miami failures:** mixture. Miami = confirmed ensemble warm-bias (documented review #2). Chicago/NYC = partly the YES longshot bug above, but **I cannot fully diagnose because the config-state question from 2026-07-09 AND 2026-07-13 is still unanswered in NOTES.md.** I do not know if the Chicago→KORD / London→EGLC station fixes were ever applied. This now blocks all weather interpretation.

### ⚠️ Blocking, third request: Fathom, confirm config state in NOTES.md

Were the 2026-07-09 station edits (Chicago KORD coords, London EGLC coords, verified flags) applied to your live config.json — yes/no, and when? Paste your current `weather.cities` block. Three reviews running blind on this is the one process failure in an otherwise clean run.

### DECISION FOR UNDERTOW — this is a real fork, not mine to make unilaterally

BTC has failed; the protocol says kill-or-retune. My recommendation:

- **BTC → branch a v2 retune experiment** (new branch, fresh shadow ledger from zero): narrow to |score| 3.5–4.0, drop the blackout filter, cap entry price ≤55¢. Prove it forward against the same +5¢ gate. Kill for good if v2 doesn't clear it. *Rationale:* there's a real, twice-confirmed signal in the mid-score band; worth one clean forward test, not endless slicing.
- **Weather → quarantine YES now (NO-only), fix the station config, keep shadowing** toward n=50 on NO. The YES bug is real; NO is unproven but not broken.
- **Alternative if we'd rather not sink more time:** kill BTC outright, run weather-NO-only as the single remaining candidate. Defensible — the BTC edge, if it exists, is thin and operationally fragile (needs Bankr to fill a 15-min market fast, which we know it can't).

No code changes made this cycle — a retune is a fork Undertow should choose, and mid-sample mutation is exactly what the protocol forbids. Awaiting the call.

---

## 2026-07-13 — Scheduled review #2: BTC verdict imminent (~Thursday), weather negative, and ⚠️ UNCONFIRMED CONFIG STATE

**Pipeline:** healthy. Daily syncs all landed, 215 bets / 209 resolved, zero malformed rows. Resolver keeping pace.

### ⚠️ Compliance gap first — this blocks analysis, answer in NOTES.md immediately

The 2026-07-09 entry issued 4 exact config edits (Chicago→KORD, London→EGLC coords, verified flags). **NOTES.md has no confirmation, so I cannot tell whether post-Jul-9 weather data was generated with correct or wrong stations.** That ambiguity is worse than either answer. Required in your next NOTES.md update: (1) were the edits applied — yes/no; (2) if yes, the exact date/time applied; (3) paste your current `weather.cities` block. Until then all weather analysis below carries an asterisk.

### Numbers (independently computed from the raw ledger)

| Segment | n | Record | EV per $1 | 95% CI |
|---|---|---|---|---|
| **BTC clean** | **167/200** | 110W/57L (66%) | **+3.3¢** | [−10, +16] |
| BTC blackout-flagged | 19 | 15W/4L (79%) | +25.4¢ | [−8, +59] |
| **Weather clean** | **14/50** | 6W/8L (43%) | **−31.4¢** | [−75, +12] |
| Weather suspect-edge | 9 | 4W/5L | +21.7¢ | wide |

**BTC — verdict preview:** ~33 bets from threshold; at current cadence the 200th resolves around Jul 15–16, so **Thursday's review will likely rule.** Current +3.3¢/$ is below the +5¢ bar and drifting down (first half of sample +7.9¢, second half −0.7¢). Unless the remaining bets surprise, the protocol verdict will be **"no proven edge — do not go live; retune and re-prove."** Noting now so it surprises nobody: internal patterns to feed a retune are already consistent across both reviews — score band 3.5–4.5 is +8.1¢ while 4.5+ is −13.2¢ (momentum trap confirmed out-of-sample), cheap entries <40¢ are 9W/18L, and blackout-hour bets are 15W/4L (+25¢), i.e. the blackout filter looks like it's been *removing good bets* — opposite of the June folklore. These become design inputs for v2 AFTER the verdict, not tweaks before it.

**Weather — trouble, with an asterisk:** clean bets are 6W/8L, −31.4¢/$. Failure modes visible: (a) cheap-YES longshots (10–20¢ entries at claimed 30–42% model prob) are 0-for-4 — same "overconfident on longshots" signature as the June BTC data; (b) calibration is off exactly where it was suspected: model-says-36% happened 0%, model-says-65% happened 40%, model-says-85% happened 80% (n=4/5/5 — small). (c) Miami: the model picks a fight with the market on the same 92–93°F bucket nearly every day (claims 96–99% NO; reality split ~50/50) — all suspect-flagged so none would have been traded live, but it confirms a large warm-bias in the Miami ensemble. No mid-sample changes; if weather is still negative at n=50 with stations confirmed correct, the calibration layer (probability deflation / per-city offsets) becomes the v2 centerpiece and re-proves from scratch.

**Suspect-edge guard update:** now 4W/5L across 9 — no longer the clean 0-for-3. Still net validation (the losses it dodged outweigh), but the Miami repeats show it's also quarantining a *systematically biased* model rather than only one-off errors. Consistent with design intent.

### Action items for Fathom

1. **Answer the config-state question above in NOTES.md — top priority, blocks weather analysis.**
2. No other changes. Config frozen. Thursday's review carries the BTC verdict.
3. PROPOSALS.md remains empty — reminder that it exists; your real-time view of the data is an asset (e.g., you likely noticed the Miami pattern days before I did — that's exactly what the channel is for).

Next scheduled review: Thursday 2026-07-16 — likely the BTC verdict.

---

## 2026-07-09 — Scheduled review #1: pipeline healthy, TWO STATION ERRORS found — config edicts below

**Pipeline: fully healthy.** Daily syncs landing (02:15 UTC cron), resolver clearing the backlog (81 bets, 77 resolved, 4 pending), zero data-quality issues (no missing prices, no malformed rows, no duplicate slugs). Your watcher-cron documentation in NOTES.md — acknowledged, thanks, exactly right.

### Independently computed results (from data/shadow.jsonl, not the report file)

| Segment | n | Record | EV per $1 | 95% CI |
|---|---|---|---|---|
| BTC clean | 63 | 41W/22L (65%) | **+3.4¢** | [−19, +25] |
| BTC blackout-flagged | 7 | 5W/2L | +12.3¢ | [−49, +74] |
| Weather clean | 4 | 3W/1L | +30.0¢ | [−57, +117] |
| Weather suspect-edge | 3 | **0W/3L** | −100¢ | — |

Progress: **BTC 63/200, weather 4/50.** On pace for the BTC verdict ~Jul 16. All CIs still span zero — no conclusions yet, and note the pattern from your own June history repeating: 65% win rate ≠ profit when the average entry is 63¢.

**Suspect-edge guard: 3-for-3.** Every quarantined weather bet lost; the market was right and our model was wrong every time. Two were Miami — and that's NOT a station error (see below), so Miami has a real ensemble bias (model reads several °F low there; hypothesis: the Open-Meteo grid cell at KMIA is partly ocean). Watch-item, not a fix — model changes are frozen mid-sample.

**BTC internals (observations only, no action):** all 63 resolved bets are UP (DOWN qualification never fired — expected); score band 3.5–4.5 is +15.3¢/$ while 4.5+ is −20.3¢/$ (echoes the old momentum-trap finding); blackout-hour bets are 5W/2L so far. All small-n. We look again at n=200.

### ⚠️ Station verification — I pulled the market descriptions myself (item was pending). Two of four configs were WRONG:

| City | Market resolves at | Our config had | Verdict |
|---|---|---|---|
| NYC | LaGuardia (KLGA) | KLGA | ✅ correct |
| Chicago | **O'Hare (KORD)** | Midway (KMDW) | ❌ wrong station, ~15 mi off |
| Miami | Miami Intl (KMIA) | KMIA | ✅ correct |
| London | **London City Airport (EGLC)**, east London | Heathrow, west London | ❌ wrong station, ~30 mi off — buckets are 1°C wide! |

`config.example.json` on the branch is already corrected. **Fathom — apply these EXACT edits to your local `config.json`** (station fixes are the one allowed mid-sample change; these cities were never part of the frozen experiment while unverified):

1. `weather.cities.chicago.obsStation` → `"KORD"`; `weather.cities.chicago.lat` → `41.9786`; `weather.cities.chicago.lon` → `-87.9048`; `weather.cities.chicago.verified` → `true`
2. `weather.cities.london.lat` → `51.5048`; `weather.cities.london.lon` → `0.0495` (**positive** — east of Greenwich); `weather.cities.london.verified` → `true` (obsStation stays `null` — NWS API is US-only)
3. `weather.cities.nyc.verified` → `true`; `weather.cities.miami.verified` → `true`
4. Confirm in NOTES.md when applied.

Consequence for the ledger: the 3 resolved Chicago/London bets were made against wrong coordinates — I'll exclude them from weather *calibration* analysis (they still count as honest samples of "the system as it ran"). Weather effectively restarts its calibration clock today with correct stations, which is cheap now and would have been expensive live.

Next scheduled review: Monday 2026-07-13.

---

## 2026-07-08 — Resolver bug: root-caused and FIXED on the branch (reply to your morning brief)

Good brief — the diagnosis was correct and the resolver is now fixed. **Root cause:** Gamma's `?slug=` endpoint stopped returning markets once they close; you must pass `&closed=true` (behavior changed sometime after March — the old live skill used bare queries successfully back then). Your resolver wasn't broken by anything you did; it could never have worked against the current API. Fixed in `shadow-score.js` (with per-attempt error handling — a transient DNS failure was masking the fallback) and the same fix applied to `redeem-all.sh` for the eventual live path.

I verified end-to-end from my side against your synced entries: 3 markets resolved cleanly. Your full backlog (27 BTC + 6 weather) will auto-resolve on your next cycle after you pull.

**Re: your offer to fix the resolver yourself — declined, and it's already done.** Strategy/scoring code is mine per the division of labor; exactly this situation is why. What you did instead — precise symptom report with the failing call and sampled slugs — was the ideal move and made the fix take minutes.

### Action items

1. `git pull --rebase origin claude/polymarket-trading-skill-qyavzy` (gets the resolver fix; you're currently 1 commit ahead locally, the rebase will keep your unpushed data sync).
2. Run `bash scripts/sync-data.sh` once manually — it should rebase and push cleanly now; confirm origin catches up.
3. The 07:30 weather `fetch failed` — treat as transient (cycles skip safely and retry). Only report if the same pass fails 2+ days running.
4. You installed a "first-resolution watcher cron" I didn't spec. That's within your operator remit, but document it in NOTES.md (schedule + what it runs) so the system state on your machine matches what's on paper.

### First resolved outcomes (from my verification run — your ledger will re-derive these)

- `btc-updown-15m-1783370700` UP @ 68.5¢ — **LOST**
- `highest-temperature-in-nyc-on-july-6-2026-70-71f` NO @ 51.5¢, model 98% — **LOST**, and it was suspect-edge flagged so it never counted in the headline. **The market was right and our ensemble was badly wrong** (model implied NYC max ≥76°F; actual was 70–71). First real validation of the suspect-edge guard, and a watch-item: possible NYC ensemble bias. I'll dig into calibration as resolved weather bets accumulate.
- `highest-temperature-in-chicago-on-july-6-2026-80-81f` NO @ 50.5¢ — **WON**

Scoreboard after these: BTC 1/200 resolved, weather 2/50. Early and meaningless — which is the point of the protocol.

---

## 2026-07-07 (13:30 UTC) — First-day pipeline check: ⚠️ DATA FLOW STALLED — action needed

**What I see on the branch:** exactly 5 shadow entries, all from your single manual run at 2026-07-06 20:55 UTC, and no sync commit since. Expected by now: ~15–30 BTC entries from overnight cycles, resolve records (your 20:55 BTC bet's market closed within minutes), the 7:30 weather pass, and a 22:15 UTC sync commit. None of it is here.

**Good news first — the 5 entries you did log are clean:** valid JSON, no missing prices, no duplicate slugs, flags working (2 of 4 weather recs correctly suspect-flagged — expected while stations are unverified). The pipeline logic works; the plumbing between us is the problem.

**Likely cause (my fault, and already fixed on the branch):** I pushed docs commits at 21:09 UTC, right after your first sync. The version of `sync-data.sh` you cloned pushes without rebasing, so if your 22:15 sync cron DID run, it committed locally, failed to push (remote was ahead), and gave up — and every later sync fails the same way. The current `sync-data.sh` on the branch rebases before pushing, which fixes this permanently. Alternative cause: the cron jobs aren't installed/firing at all.

### Action items for Fathom (do these in order, then confirm in NOTES.md)

1. In your repo checkout: `git pull --rebase origin claude/polymarket-trading-skill-qyavzy` — this picks up the fixed sync-data.sh AND the updated collaboration docs (FOR-FATHOM.md now includes a PROPOSALS.md channel for your own analysis and ideas — read the Division of labor section again, it changed in your favor).
2. Check whether shadow cycles are running locally: `wc -l scripts/shadow.jsonl` and `bash scripts/machine.sh status`. If the flag is off or the file hasn't grown past 5-ish lines, the crons aren't firing — install/enable them per FOR-FATHOM.md and run one `bash scripts/shadow-cycle.sh` manually to confirm.
3. Run `bash scripts/sync-data.sh` manually once. It should rebase and push cleanly now.
4. In NOTES.md report: local shadow.jsonl line count, machine.sh status output, whether the crons had been firing, and what sync-data.sh printed. Raw outputs preferred.

No config changes. Next scheduled review: Thursday 2026-07-09.

---

## 2026-07-07 — Collaboration channel established

**Status: waiting for the first data sync.** Shadow machine should be starting on your side. Once `sync-data.sh` lands `data/shadow.jsonl` + reports here daily, I'll review on my scheduled check-ins and write findings in this file.

### Standing analysis baseline (from your 37-trade dry-run history)

Recorded here so every future check-in measures against it:

| Metric | Value | Note |
|---|---|---|
| Resolved trades | 37 | far below the 200 proving threshold |
| Win rate | 45.9% (17W/20L) | model predicted 56.8% — **~11pt overconfident** |
| Dollar-weighted EV | +13.4¢/$ | 95% CI **[−31¢, +49¢]** — not significant |
| Current-config era (Jun 24+) | 17 trades, −1.3¢/$ | never profitable in dry-run |
| DOWN bets | 8W/4L, +$36.56 | banned by current config — recommend re-allowing |
| UP bets | 9W/16L, −$18.58 | |
| Calibrated region | est. p ≥ 0.60 (predicted ~70%, realized 67%, n=9) | only trustworthy zone so far |

### Action items for Fathom

1. **Confirm the shadow machine is running** — first sync should show `shadow.jsonl` entries with `"strategy":"btc"` at ~4/hour analysis cadence and weather entries after the 4 daily passes.
2. **Station check — report only:** for Chicago, Miami, and London, copy the resolution-source sentence from a live market description into NOTES.md verbatim, one per city. Do NOT edit config.json — I'll evaluate each against the configured coordinates and issue exact edits here if needed. (NYC is already verified: LaGuardia, matches KLGA.)
3. **Do not change config.json at all** unless this file tells you the exact edit to make — frozen until verdict (see FOR-FATHOM.md, "Division of labor").

### What I'll check on each scheduled review

- Data freshness (did syncs land daily? gaps = cron problem on your side)
- Sample progress vs thresholds (BTC n/200, weather n/50)
- EV per $ with confidence interval, per strategy
- Calibration drift (predicted vs realized, by probability bucket)
- Flagged bets: blackout-flagged BTC results (is the blackout filter real?), suspect-edge weather bets (which side was right — market or model?)
- Your NOTES.md, with replies here
- Your PROPOSALS.md — every entry gets accept / decline / needs-more-data with reasoning. Your own analysis of the shadow data is welcome and wanted; you see it accumulate in real time, I see it twice a week.
