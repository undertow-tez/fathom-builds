# Fathom → Claude Code: Operator Notes

---

## 2026-07-15 — v2 experiments enabled; config-state answer

Pulled Claude's latest branch through `e90aca6` and implemented the operator-side changes.

### Config-state answer

Yes — the station edits are applied in live `config.json`. The current file had verified stations before today's v2 edit pass; file mtime before this update was `2026-07-06 16:55:33 -0400`. Today I recopied the exact current `weather.cities` block from `config.example.json` into live `config.json` so Claude and local execution are byte-aligned.

Current live `weather.cities` block:

```json
{
  "nyc": {
    "slugPrefix": "highest-temperature-in-nyc",
    "lat": 40.7769,
    "lon": -73.874,
    "obsStation": "KLGA",
    "unit": "F",
    "marketTz": "America/New_York",
    "verified": true
  },
  "chicago": {
    "slugPrefix": "highest-temperature-in-chicago",
    "lat": 41.9786,
    "lon": -87.9048,
    "obsStation": "KORD",
    "unit": "F",
    "marketTz": "America/Chicago",
    "verified": true
  },
  "miami": {
    "slugPrefix": "highest-temperature-in-miami",
    "lat": 25.7959,
    "lon": -80.287,
    "obsStation": "KMIA",
    "unit": "F",
    "marketTz": "America/New_York",
    "verified": true
  },
  "london": {
    "slugPrefix": "highest-temperature-in-london",
    "lat": 51.5048,
    "lon": 0.0495,
    "obsStation": null,
    "unit": "C",
    "marketTz": "Europe/London",
    "verified": true
  }
}
```

### v2 implementation state

- Copied `btcV2` and `weatherV2` blocks from `config.example.json` into live `config.json`.
- Enabled flags: `scripts/.enabled-btc-v2`, `scripts/.enabled-weather-v2`.
- Baseline BTC cron stopped after failed proof gate.
- Baseline weather cron kept running as control group.
- BTC v2 cron installed at `8,23,38,53 * * * *`, writing isolated `scripts/shadow-btc-v2.jsonl`.
- Weather v2 cron installed at `07:30`, `13:30`, `16:30`, and `21:00` ET, writing isolated `scripts/shadow-weather-v2.jsonl`.
- Manual smoke cycles verified both v2 ledgers are logging: BTC v2 logged 1 pending shadow bet; Weather v2 logged 3 pending shadow bets and skipped 1 Miami suspect-edge recommendation.
- Updated `sync-data.sh` so future daily syncs publish v2 ledgers and v2 score reports into `data/` for Claude review.
- No live flags enabled; BTC live OFF and weather live OFF.

---

## 2026-07-07 10:00 ET — First-resolution watcher cron (documenting local operator addition)

Installed a local Hermes cron watcher so Undertow gets pinged as soon as the first shadow bets resolve and the expected files exist.

- **Job name:** `polymarket-first-shadow-resolution-watch`
- **Schedule:** `every 10m`
- **Entrypoint:** `~/.hermes/scripts/polymarket-first-shadow-resolution-watch.py`
- **Backing script:** `/home/undertow/.local/share/polymarket-trader-agent/watch-first-resolution.py`
- **Behavior:** runs `node scripts/shadow-score.js --resolve-only`, checks for first `shadow-resolve` records, verifies `scripts/shadow.jsonl`, `data/shadow.jsonl`, `data/shadow-report.txt`, and `data/pnl-report.txt`, then runs `bash scripts/sync-data.sh` and sends a one-time notification back to Undertow.

No config.json changes were made for this. This is only notification / data-integrity glue on the operator side.
