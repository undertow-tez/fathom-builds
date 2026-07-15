#!/bin/bash
# Weather v2 retune — ISOLATED forward-test. Separate ledger, fresh from zero.
#
# Baseline weather-YES failed (0W/7L, p~0.015): the max-edge bucket picker
# cherry-picked the model's overconfident cheap tail buckets (winner's curse).
# v2 (config.weatherV2) fixes the mechanism:
#   - selectBy "modelProb": bet the bucket the model is most CONFIDENT in, not
#     the one where it most disagrees with the market
#   - minModelProb 0.5: must actually favor the outcome (kills longshot YES)
# Must clear the SAME +5c/$ gate at n>=50 to earn a live recommendation.
# Never merged with the baseline shadow.jsonl.
#
# Cron like the baseline weather shadow (4 daily passes):
#   30 7,13,16 * * *  and  0 21 * * *   bash .../scripts/weather-v2-shadow.sh
#
# Score with: node scripts/shadow-score.js --file scripts/shadow-weather-v2.jsonl

set -euo pipefail
source ~/.openclaw/workspace/.cron_env 2>/dev/null || true

DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$DIR/../config.json"
LEDGER="$DIR/shadow-weather-v2.jsonl"

[ -f "$DIR/.enabled-weather-v2" ] || exit 0

echo "👻v2 Weather retune cycle — $(date -u +'%Y-%m-%d %H:%M UTC')"

node "$DIR/shadow-score.js" --file "$LEDGER" --resolve-only 2>&1 || true

# Per-day caps apply against the v2 ledger itself
OUTPUT=$(node "$DIR/weather-strategy.js" --config "$CONFIG" --profile weatherV2 --bets-file "$LEDGER" 2>&1 || true)
echo "$OUTPUT" | grep -v '^__WEATHER_BETS__'
RECS=$(echo "$OUTPUT" | grep '^__WEATHER_BETS__:' | tail -1 | sed 's/^__WEATHER_BETS__://')
COUNT=$(echo "${RECS:-[]}" | jq 'length' 2>/dev/null || echo 0)

for i in $(seq 0 $((COUNT - 1))); do
  REC=$(echo "$RECS" | jq -c ".[$i]")
  if [ "$(echo "$REC" | jq -r '.suspect // false')" = "true" ]; then
    echo "🚩 Skipping suspect-edge: $(echo "$REC" | jq -r '.question')"
    continue
  fi
  SLUG=$(echo "$REC" | jq -r '.slug')
  if grep -q "\"slug\":\"$SLUG\"" "$LEDGER" 2>/dev/null; then
    echo "🔒 $SLUG already shadowed"
    continue
  fi
  jq -nc --arg time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg strategy weather_v2 --argjson rec "$REC" \
    '{time:$time, strategy:$strategy, slug:$rec.slug, market:$rec.question,
      outcome:$rec.side, outcomeIndex:$rec.outcomeIndex,
      amount:($rec.amount|tostring), price:($rec.price|tostring), flags:[],
      meta:{city:$rec.city, date:$rec.date, modelProb:$rec.modelProb, edge:$rec.edge},
      result:"shadow"}' >> "$LEDGER"
  echo "👻v2 Shadowed: $(echo "$REC" | jq -r '"\(.side) \"\(.question)\" @ \(.price) (model \(.modelProb))"')"
done
[ "$COUNT" = "0" ] && echo "⏸️  No v2 weather recs this cycle"
echo "✅ Weather v2 cycle complete"
