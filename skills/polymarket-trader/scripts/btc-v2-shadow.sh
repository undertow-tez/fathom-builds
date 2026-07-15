#!/bin/bash
# BTC v2 retune — ISOLATED forward-test. Separate ledger, fresh from zero.
#
# The baseline BTC strategy FAILED the proof gate (2026-07-15, -0.3c/$, n=226).
# v2 tests a specific, data-derived hypothesis on NEW data:
#   - mid score band only (config.btcV2: minScore 3, maxScore 4)
#   - cheap entries only (maxEntryPrice 0.55)
#   - blackout filter OFF (baseline data showed it removed good bets)
# It must clear the SAME +5c/$ gate at n>=200 to earn a live recommendation.
# This is a NEW experiment — never merged with the baseline shadow.jsonl.
#
# Cron this like the baseline BTC shadow (every 15-min window):
#   8,23,38,53 * * * *   bash .../scripts/btc-v2-shadow.sh
#
# Score with: node scripts/shadow-score.js --file scripts/shadow-btc-v2.jsonl

set -euo pipefail
source ~/.openclaw/workspace/.cron_env 2>/dev/null || true

DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$DIR/../config.json"
LEDGER="$DIR/shadow-btc-v2.jsonl"

[ -f "$DIR/.enabled-btc-v2" ] || exit 0

echo "👻v2 BTC retune cycle — $(date -u +'%Y-%m-%d %H:%M UTC')"

# Resolve pending v2 bets
node "$DIR/shadow-score.js" --file "$LEDGER" --resolve-only 2>&1 || true

OUTPUT=$(node "$DIR/btc-strategy.js" --asset btc --config "$CONFIG" --profile btcV2 2>&1 || true)
SIGNAL=$(echo "$OUTPUT" | grep '^__SIGNAL__:' | tail -1 | sed 's/^__SIGNAL__://')
[ -z "$SIGNAL" ] && { echo "❌ No signal"; exit 0; }

DECISION=$(echo "$SIGNAL" | jq -r '.decision')
SCORE=$(echo "$SIGNAL" | jq -r '.score')
if [ "$DECISION" = "NO_BET" ]; then
  echo "⏸️  NO_BET (score $SCORE)"
  exit 0
fi

SLUG=$(echo "$SIGNAL" | jq -r '.slug')
if grep -q "\"slug\":\"$SLUG\"" "$LEDGER" 2>/dev/null; then
  echo "🔒 $SLUG already shadowed"
  exit 0
fi

DIRECTION=$([ "$DECISION" = "BET_UP" ] && echo "UP" || echo "DOWN")
IDX=$([ "$DIRECTION" = "UP" ] && echo 0 || echo 1)
PRICE=$(echo "$SIGNAL" | jq -r '.entryPrice // empty')
[ -z "$PRICE" ] && PRICE=$(curl -s --max-time 15 "https://gamma-api.polymarket.com/markets?slug=$SLUG" | jq -r ".[0].outcomePrices | fromjson | .[$IDX]" 2>/dev/null || echo "")
BET_SIZE=$(jq -r '.btc.betSize // 5' "$CONFIG" 2>/dev/null || echo 5)

jq -nc \
  --arg time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg strategy btc_v2 --arg slug "$SLUG" \
  --arg market "$(echo "$SIGNAL" | jq -r '.question')" --arg outcome "$DIRECTION" \
  --argjson outcomeIndex "$IDX" --arg amount "$BET_SIZE" --arg price "$PRICE" \
  --argjson meta "$(echo "$SIGNAL" | jq -c '{score, rsi, vol, hourly}')" \
  '{time:$time, strategy:$strategy, slug:$slug, market:$market, outcome:$outcome,
    outcomeIndex:$outcomeIndex, amount:$amount, price:$price, flags:[], meta:$meta,
    result:"shadow"}' >> "$LEDGER"
echo "👻v2 Shadowed: $DIRECTION \$${BET_SIZE} @ ${PRICE:-?} (score $SCORE)"
