#!/bin/bash
# BTC 5-Min Strategy: Analyze + Execute via Bankr
# Usage: ./execute.sh [--dry-run] [--bet-size 3]

set -euo pipefail
source /home/ubuntu/.openclaw/workspace/.cron_env 2>/dev/null || true

DIR="$(cd "$(dirname "$0")" && pwd)"
DRY_RUN=""
BET_SIZE="3"

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN="--dry-run" ;;
    --bet-size) shift; BET_SIZE="${1:-3}" ;;
  esac
done

# Run strategy
OUTPUT=$(node "$DIR/strategy.js" $DRY_RUN --bet-size "$BET_SIZE" 2>&1)
echo "$OUTPUT"

# Parse signal
SIGNAL_LINE=$(echo "$OUTPUT" | grep "^__SIGNAL__:" | tail -1)
if [ -z "$SIGNAL_LINE" ]; then
  echo "❌ No signal parsed"
  exit 1
fi

DECISION=$(echo "$SIGNAL_LINE" | cut -d: -f2)
SCORE=$(echo "$SIGNAL_LINE" | cut -d: -f3)
PRICE=$(echo "$SIGNAL_LINE" | cut -d: -f4)

if [ "$DECISION" = "NO_BET" ]; then
  echo "⏸️  Strategy says skip. Done."
  exit 0
fi

if [ -n "$DRY_RUN" ]; then
  echo "🏷️  DRY RUN — would submit to Bankr. Exiting."
  exit 0
fi

# Execute via bet.sh (handles market window validation + Bankr submission)
DIRECTION=$([ "$DECISION" = "BET_UP" ] && echo "UP" || echo "DOWN")

echo ""
echo "🚀 Executing via bet.sh: $DIRECTION \$${BET_SIZE}"
echo ""

bash "$DIR/bet.sh" "$DIRECTION" "$BET_SIZE" "" "$SCORE"
BET_EXIT=$?

# Log execution
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "{\"time\":\"$TIMESTAMP\",\"decision\":\"$DECISION\",\"score\":\"$SCORE\",\"price\":\"$PRICE\",\"betSize\":\"$BET_SIZE\",\"betExit\":\"$BET_EXIT\"}" >> "$DIR/executions.jsonl"

if [ $BET_EXIT -eq 0 ]; then
  echo ""
  echo "✅ Bet submitted: \$${BET_SIZE} on ${DIRECTION} (score: ${SCORE}, BTC: \$${PRICE})"
else
  echo ""
  echo "⏸️  No current market window — bet skipped (score: ${SCORE}, BTC: \$${PRICE})"
fi
