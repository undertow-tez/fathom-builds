#!/bin/bash
# BTC 15-min full cycle: analyze → bet → log
# Called at :08/:23/:38/:53 of each hour (8 min into each window)
# Redeem is handled separately by redeem.sh at :20/:35/:50/:05
#
# Usage: ./cycle.sh [--bet-size 3]

set -euo pipefail
source /home/ubuntu/.openclaw/workspace/.cron_env 2>/dev/null || true

DIR="$(cd "$(dirname "$0")" && pwd)"
BET_SIZE="${2:-3}"

# Parse args
for arg in "$@"; do
  case "$arg" in
    --bet-size) shift; BET_SIZE="${1:-3}" ;;
  esac
done

echo "🔄 BTC 15-Min Cycle — $(date -u +'%Y-%m-%d %H:%M UTC') ($(TZ=America/New_York date +'%I:%M %p ET'))"
echo ""

# ── Step 1: Run strategy analysis ──
echo "📊 Running momentum analysis..."
STRATEGY_OUTPUT=$(node "$DIR/strategy.js" --bet-size "$BET_SIZE" 2>&1)
echo "$STRATEGY_OUTPUT"

# Parse signal
SIGNAL_LINE=$(echo "$STRATEGY_OUTPUT" | grep "^__SIGNAL__:" | tail -1)
if [ -z "$SIGNAL_LINE" ]; then
  echo "❌ No signal parsed from strategy"
  exit 1
fi

DECISION=$(echo "$SIGNAL_LINE" | cut -d: -f2)
SCORE=$(echo "$SIGNAL_LINE" | cut -d: -f3)
PRICE=$(echo "$SIGNAL_LINE" | cut -d: -f4)

echo ""
echo "📈 Signal: $DECISION (score: $SCORE, BTC: \$$PRICE)"

# ── Step 2: Check for previous window to redeem ──
echo ""
echo "🔍 Checking previous window for redemption..."
bash "$DIR/redeem.sh" 2>&1 || true

# ── Step 3: Execute bet if signal is good ──
if [ "$DECISION" = "NO_BET" ]; then
  echo ""
  echo "⏸️  No edge detected — skipping this window"
  exit 0
fi

DIRECTION=$([ "$DECISION" = "BET_UP" ] && echo "UP" || echo "DOWN")
echo ""
echo "🚀 Executing: $DIRECTION \$${BET_SIZE} (score: $SCORE)"
bash "$DIR/bet.sh" "$DIRECTION" "$BET_SIZE" "" "$SCORE"
