#!/bin/bash
# Weather machine cycle: guards → redeem sweep → analyze → bet.
# Cron this 3-4x/day, ideally ~1-2h after model runs land:
#   ~07:30 local (00z run), ~13:30 (06z/12z), ~19:30 (12z), ~22:00 (same-day obs lock)
#
# Usage: ./weather-cycle.sh [--dry-run] [--city nyc]

set -euo pipefail
source ~/.openclaw/workspace/.cron_env 2>/dev/null || true

DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$DIR/../config.json"

# ── Machine switch ──
[ -f "$DIR/.enabled-weather" ] || exit 0

DRY_RUN=0
CITY_ARG=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --city)    CITY_ARG=(--city "$2"); shift 2 ;;
    *) shift ;;
  esac
done

echo "🌦️  Weather Cycle — $(date -u +'%Y-%m-%d %H:%M UTC')"

# ── Redeem sweep first ──
bash "$DIR/redeem-all.sh" 2>&1 || true

# ── Guard: shared daily loss limit ──
DAILY_LIMIT=$(jq -r '.dailyLossLimit // 20' "$CONFIG" 2>/dev/null || echo 20)
NET_TODAY=$(node "$DIR/pnl.js" --today --json 2>/dev/null | jq -r '.totals.net // 0' || echo 0)
echo "📊 Today's net P&L (all strategies): \$${NET_TODAY} (limit: -\$${DAILY_LIMIT})"
if python3 -c "exit(0 if float('${NET_TODAY}') < -float('${DAILY_LIMIT}') else 1)" 2>/dev/null; then
  echo "🛑 DAILY LOSS LIMIT hit — no more bets today"
  exit 0
fi

# ── Analyze ──
OUTPUT=$(node "$DIR/weather-strategy.js" --config "$CONFIG" "${CITY_ARG[@]}" 2>&1 || true)
echo "$OUTPUT"

RECS=$(echo "$OUTPUT" | grep '^__WEATHER_BETS__:' | tail -1 | sed 's/^__WEATHER_BETS__://')
if [ -z "$RECS" ] || [ "$RECS" = "[]" ]; then
  echo "⏸️  No weather bets this cycle"
  exit 0
fi

# ── Execute recommendations ──
COUNT=$(echo "$RECS" | jq 'length')
echo ""
echo "🚀 Executing $COUNT weather bet(s)..."
for i in $(seq 0 $((COUNT - 1))); do
  REC=$(echo "$RECS" | jq -c ".[$i]")
  SLUG=$(echo "$REC" | jq -r '.slug')
  QUESTION=$(echo "$REC" | jq -r '.question')
  SIDE=$(echo "$REC" | jq -r '.side')
  OUTCOME_INDEX=$(echo "$REC" | jq -r '.outcomeIndex')
  AMOUNT=$(echo "$REC" | jq -r '.amount')
  PRICE=$(echo "$REC" | jq -r '.price')

  if [ "$DRY_RUN" = "1" ]; then
    echo "🧪 [DRY RUN] Would bet \$${AMOUNT} ${SIDE} on: $QUESTION @ ${PRICE}"
    continue
  fi

  bash "$DIR/bet.sh" \
    --strategy weather --slug "$SLUG" --question "$QUESTION" \
    --outcome "$SIDE" --outcome-index "$OUTCOME_INDEX" \
    --amount "$AMOUNT" --price "$PRICE" \
    --meta "$(echo "$REC" | jq -c '{city, date, modelProb, edge}')"
  sleep 2
done

echo "✅ Weather cycle complete"
