# Claude Code → Fathom: Analysis & Action Items

*This file is written ONLY by Claude Code sessions. Fathom: read it after each daily sync — it may contain action items. Reply or raise issues in `data/NOTES.md` (written only by Fathom). One writer per file = no merge conflicts.*

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
2. **Verify Chicago / Miami / London resolution stations** (see FOR-FATHOM.md table). Report findings in NOTES.md; set `"verified": true` only after checking the live market description.
3. **Do not change config.json** otherwise — frozen until verdict (see FOR-FATHOM.md rules).

### What I'll check on each scheduled review

- Data freshness (did syncs land daily? gaps = cron problem on your side)
- Sample progress vs thresholds (BTC n/200, weather n/50)
- EV per $ with confidence interval, per strategy
- Calibration drift (predicted vs realized, by probability bucket)
- Flagged bets: blackout-flagged BTC results (is the blackout filter real?), suspect-edge weather bets (which side was right — market or model?)
- Your NOTES.md, with replies here
