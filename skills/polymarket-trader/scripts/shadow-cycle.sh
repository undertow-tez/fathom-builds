#!/bin/bash
# Shadow mode: run both strategies on their live schedules, log every would-be
# bet with its REAL entry price, never touch Bankr. No money moves.
#
# This is the proving ground. The point is to answer, with data:
#   1. Is the model actually better than the market? (EV per $, not win rate)
#   2. Are the weather model probabilities calibrated?
#   3. Does the BTC strategy survive out-of-sample at real entry prices?
#
# Cron (mirror the live schedules):
#   "8,23,38,53 * * * *"  bash shadow-cycle.sh --btc
#   "30 7 * * *"          bash shadow-cycle.sh --weather
#   "30 13 * * *"         bash shadow-cycle.sh --weather
#   "30 16 * * *"         bash shadow-cycle.sh --weather
#   "0 21 * * *"          bash shadow-cycle.sh --weather
#
# Usage: ./shadow-cycle.sh [--btc] [--weather]   (no flags = both)

set -euo pipefail
source ~/.openclaw/workspace/.cron_env 2>/dev/null || true

DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$DIR/../config.json"
SHADOW_FILE="$DIR/shadow.jsonl"

# ── Machine switch ──
[ -f "$DIR/.enabled-shadow" ] || exit 0

RUN_BTC=0; RUN_WEATHER=0
for arg in "$@"; do
  case "$arg" in
    --btc) RUN_BTC=1 ;;
    --weather) RUN_WEATHER=1 ;;
  esac
done
if [ "$RUN_BTC" = 0 ] && [ "$RUN_WEATHER" = 0 ]; then RUN_BTC=1; RUN_WEATHER=1; fi

echo "👻 Shadow Cycle — $(date -u +'%Y-%m-%d %H:%M UTC') (no real bets)"

# Resolve pending shadow bets first (BTC windows resolve within minutes)
node "$DIR/shadow-score.js" --resolve-only 2>&1 || true

# ── BTC shadow ──
if [ "$RUN_BTC" = 1 ]; then
  ASSETS=$(jq -r '(.btc.assets // ["btc"]) | join(" ")' "$CONFIG" 2>/dev/null || echo "btc")
  for ASSET in $ASSETS; do
    OUTPUT=$(node "$DIR/btc-strategy.js" --asset "$ASSET" --config "$CONFIG" 2>&1 || true)
    SIGNAL=$(echo "$OUTPUT" | grep '^__SIGNAL__:' | tail -1 | sed 's/^__SIGNAL__://')
    [ -z "$SIGNAL" ] && { echo "❌ No signal for $ASSET"; continue; }
    DECISION=$(echo "$SIGNAL" | jq -r '.decision')
    SCORE=$(echo "$SIGNAL" | jq -r '.score')
    if [ "$DECISION" = "NO_BET" ]; then
      echo "⏸️  $ASSET: NO_BET (score $SCORE)"
      continue
    fi

    SLUG=$(echo "$SIGNAL" | jq -r '.slug')
    if grep -q "\"slug\":\"$SLUG\"" "$SHADOW_FILE" 2>/dev/null; then
      echo "🔒 $SLUG already shadowed this window"
      continue
    fi

    DIRECTION=$([ "$DECISION" = "BET_UP" ] && echo "UP" || echo "DOWN")
    IDX=$([ "$DIRECTION" = "UP" ] && echo 0 || echo 1)

    # Real entry price from the live book — win rate is meaningless without it
    PRICE=$(curl -s --max-time 15 "https://gamma-api.polymarket.com/markets?slug=$SLUG" \
      | jq -r ".[0].outcomePrices | fromjson | .[$IDX]" 2>/dev/null || echo "")
    BET_SIZE=$(jq -r '.btc.betSize // 5' "$CONFIG" 2>/dev/null || echo 5)

    # Flag windows the live machine would have skipped (blackout) — the scorer
    # excludes flagged bets from the headline sim but keeps them for analysis,
    # so shadow data can also test whether the blackout filter is real or overfit.
    ET_HOUR=$(TZ=America/New_York date +'%-H')
    BLACKOUT=$(jq -c '.btc.blackoutHoursET // [11,12,13]' "$CONFIG" 2>/dev/null || echo '[11,12,13]')
    FLAGS='[]'
    if echo "$BLACKOUT" | jq -e --argjson h "$ET_HOUR" 'index($h) != null' >/dev/null 2>&1; then
      FLAGS='["blackout"]'
    fi

    jq -nc \
      --arg time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg strategy btc --arg slug "$SLUG" \
      --arg market "$(echo "$SIGNAL" | jq -r '.question')" --arg outcome "$DIRECTION" \
      --argjson outcomeIndex "$IDX" --arg amount "$BET_SIZE" --arg price "$PRICE" \
      --argjson flags "$FLAGS" --argjson meta "$(echo "$SIGNAL" | jq -c '{score, rsi, vol, hourly}')" \
      '{time:$time, strategy:$strategy, slug:$slug, market:$market, outcome:$outcome,
        outcomeIndex:$outcomeIndex, amount:$amount, price:$price, flags:$flags, meta:$meta,
        result:"shadow"}' >> "$SHADOW_FILE"
    echo "👻 Shadowed: $ASSET $DIRECTION \$${BET_SIZE} @ ${PRICE:-?} (score $SCORE)$([ "$FLAGS" != '[]' ] && echo ' [blackout-flagged]')"
  done
fi

# ── Weather shadow ──
if [ "$RUN_WEATHER" = 1 ]; then
  OUTPUT=$(node "$DIR/weather-strategy.js" --config "$CONFIG" --bets-file "$SHADOW_FILE" 2>&1 || true)
  echo "$OUTPUT" | grep -v '^__WEATHER_BETS__'
  RECS=$(echo "$OUTPUT" | grep '^__WEATHER_BETS__:' | tail -1 | sed 's/^__WEATHER_BETS__://')
  COUNT=$(echo "${RECS:-[]}" | jq 'length' 2>/dev/null || echo 0)
  for i in $(seq 0 $((COUNT - 1))); do
    REC=$(echo "$RECS" | jq -c ".[$i]")
    SLUG=$(echo "$REC" | jq -r '.slug')
    if grep -q "\"slug\":\"$SLUG\"" "$SHADOW_FILE" 2>/dev/null; then
      echo "🔒 $SLUG already shadowed"
      continue
    fi
    jq -nc \
      --arg time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg strategy weather \
      --argjson rec "$REC" \
      '{time:$time, strategy:$strategy, slug:$rec.slug, market:$rec.question,
        outcome:$rec.side, outcomeIndex:$rec.outcomeIndex,
        amount:($rec.amount|tostring), price:($rec.price|tostring),
        flags:(if ($rec.suspect // false) then ["suspect-edge"] else [] end),
        meta:{city:$rec.city, date:$rec.date, modelProb:$rec.modelProb, edge:$rec.edge},
        result:"shadow"}' >> "$SHADOW_FILE"
    echo "👻 Shadowed: $(echo "$REC" | jq -r '"\(.side) \"\(.question)\" @ \(.price) (model \(.modelProb), edge +\(.edge))"')"
  done
  [ "$COUNT" = "0" ] && echo "⏸️  No weather recommendations this cycle"
fi

echo "✅ Shadow cycle complete — score anytime with: node shadow-score.js"
