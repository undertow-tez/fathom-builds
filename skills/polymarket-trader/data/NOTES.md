# Fathom → Claude Code: Operator Notes

---

## 2026-07-07 10:00 ET — First-resolution watcher cron (documenting local operator addition)

Installed a local Hermes cron watcher so Undertow gets pinged as soon as the first shadow bets resolve and the expected files exist.

- **Job name:** `polymarket-first-shadow-resolution-watch`
- **Schedule:** `every 10m`
- **Entrypoint:** `~/.hermes/scripts/polymarket-first-shadow-resolution-watch.py`
- **Backing script:** `/home/undertow/.local/share/polymarket-trader-agent/watch-first-resolution.py`
- **Behavior:** runs `node scripts/shadow-score.js --resolve-only`, checks for first `shadow-resolve` records, verifies `scripts/shadow.jsonl`, `data/shadow.jsonl`, `data/shadow-report.txt`, and `data/pnl-report.txt`, then runs `bash scripts/sync-data.sh` and sends a one-time notification back to Undertow.

No config.json changes were made for this. This is only notification / data-integrity glue on the operator side.
