#!/bin/bash
# On/off switch for the trading machines. Cron jobs stay in place permanently;
# cycle scripts exit silently when their .enabled flag is missing.
#
# Usage: ./machine.sh start|stop|status [btc|weather|shadow|all]
# Recommended sequence: start shadow FIRST (proving protocol in SKILL.md);
# go live only after shadow-score.js shows the edge holds.

set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
CMD="${1:-status}"
TARGET="${2:-all}"

machines() {
  case "$TARGET" in
    btc) echo "btc" ;;
    weather) echo "weather" ;;
    shadow) echo "shadow" ;;
    all) echo "btc weather shadow" ;;
    *) echo "Unknown machine: $TARGET (use btc|weather|shadow|all)" >&2; exit 1 ;;
  esac
}

for M in $(machines); do
  FLAG="$DIR/.enabled-$M"
  case "$CMD" in
    start)  touch "$FLAG"; echo "▶️  $M machine ON" ;;
    stop)   rm -f "$FLAG"; echo "⏹️  $M machine OFF" ;;
    status) [ -f "$FLAG" ] && echo "▶️  $M: ON" || echo "⏹️  $M: OFF" ;;
    *) echo "Usage: machine.sh start|stop|status [btc|weather|shadow|all]" >&2; exit 1 ;;
  esac
done
