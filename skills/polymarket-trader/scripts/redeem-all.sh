#!/bin/bash
# Sweep bets.jsonl for unresolved bets, check resolution on Gamma API, redeem via Bankr.
# Works for both machines: resolution is generic via outcomeIndex
# (winner = whichever outcome's price went to ~1.0).
#
# Run at every cycle — it's cheap and clears the backlog.

set -euo pipefail
source ~/.openclaw/workspace/.cron_env 2>/dev/null || true

DIR="$(cd "$(dirname "$0")" && pwd)"
source "$DIR/lib/bankr.sh"
BETS_FILE="$DIR/bets.jsonl"

[ -f "$BETS_FILE" ] || { echo "No bets file — nothing to redeem"; exit 0; }

echo "🔍 Scanning for unresolved bets..."

UNRESOLVED=$(python3 - "$BETS_FILE" <<'PYEOF'
import json, sys
submitted, redeemed = {}, set()
for line in open(sys.argv[1]):
    line = line.strip()
    if not line: continue
    try:
        d = json.loads(line)
    except Exception:
        continue
    if d.get('action') == 'redeem':
        redeemed.add(d.get('slug', ''))
    elif d.get('result') == 'submitted' and d.get('slug'):
        submitted[d['slug']] = d
for slug, d in submitted.items():
    if slug not in redeemed:
        print(json.dumps(d))
PYEOF
)

if [ -z "$UNRESOLVED" ]; then
  echo "✅ No unresolved bets"
  exit 0
fi

RESOLVED=0
STILL_OPEN=0

while IFS= read -r BET; do
  [ -z "$BET" ] && continue
  SLUG=$(echo "$BET" | jq -r '.slug')
  QUESTION=$(echo "$BET" | jq -r '.market')
  OUR_INDEX=$(echo "$BET" | jq -r '.outcomeIndex')
  OUR_OUTCOME=$(echo "$BET" | jq -r '.outcome')
  OUR_AMT=$(echo "$BET" | jq -r '.amount')
  STRATEGY=$(echo "$BET" | jq -r '.strategy // "?"')

  echo "  Checking: $SLUG"
  # Gamma hides closed markets from bare slug queries — retry with closed=true
  MARKET_DATA=$(curl -s --max-time 15 "https://gamma-api.polymarket.com/markets?slug=${SLUG}" 2>/dev/null || echo '[]')
  if [ "$(echo "$MARKET_DATA" | jq 'length' 2>/dev/null || echo 0)" = "0" ]; then
    MARKET_DATA=$(curl -s --max-time 15 "https://gamma-api.polymarket.com/markets?slug=${SLUG}&closed=true" 2>/dev/null || echo '[]')
  fi

  WINNER_INDEX=$(echo "$MARKET_DATA" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    print('ERR'); sys.exit(0)
if not data:
    print('NOTFOUND'); sys.exit(0)
m = data[0]
if not m.get('closed', False):
    print('OPEN'); sys.exit(0)
prices = m.get('outcomePrices', '[]')
p = json.loads(prices) if isinstance(prices, str) else prices
p = [float(x) for x in p]
for i, x in enumerate(p):
    if x > 0.9:
        print(i); sys.exit(0)
print('UNKNOWN')
" 2>/dev/null || echo "ERR")

  case "$WINNER_INDEX" in
    OPEN|NOTFOUND|UNKNOWN|ERR)
      echo "    ⏳ Still open / not resolved ($WINNER_INDEX)"
      STILL_OPEN=$((STILL_OPEN + 1))
      continue
      ;;
  esac

  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  if [ "$WINNER_INDEX" = "$OUR_INDEX" ]; then
    RESULT_MSG="✅ WON"
    echo "    ✅ WON ($OUR_OUTCOME) — redeeming \$$OUR_AMT bet"
  else
    RESULT_MSG="❌ LOST"
    echo "    ❌ LOST ($OUR_OUTCOME, winner index: $WINNER_INDEX)"
  fi

  REDEEM_JOB=""
  PAYOUT=""
  if [ "$RESULT_MSG" = "✅ WON" ]; then
    REDEEM_SUBMIT=$(bankr_submit "Redeem my position on '${QUESTION}' on Polymarket" 2>&1 || true)
    REDEEM_JOB=$(echo "$REDEEM_SUBMIT" | jq -r '.jobId // empty' 2>/dev/null || echo "")
    if [ -n "$REDEEM_JOB" ]; then
      REDEEM_TEXT=$(bankr_poll "$REDEEM_JOB" 180 2>/dev/null || echo "")
      PAYOUT=$(echo "$REDEEM_TEXT" | grep -oiE '(redeemed|claimed|received)[^0-9]*[0-9]+\.?[0-9]*' | grep -oE '[0-9]+\.?[0-9]*' | head -1 || echo "")
    fi
  fi

  jq -nc \
    --arg time "$TIMESTAMP" --arg slug "$SLUG" --arg market "$QUESTION" \
    --arg strategy "$STRATEGY" --arg winnerIndex "$WINNER_INDEX" \
    --arg outcome "$OUR_OUTCOME" --arg amount "$OUR_AMT" \
    --arg result "$RESULT_MSG" --arg redeemJob "$REDEEM_JOB" --arg payout "$PAYOUT" \
    '{time:$time, action:"redeem", slug:$slug, market:$market, strategy:$strategy,
      winnerIndex:$winnerIndex, outcome:$outcome, amount:$amount, result:$result,
      redeemJob:$redeemJob} + (if $payout != "" then {payout:$payout} else {} end)' >> "$BETS_FILE"

  [ -n "$PAYOUT" ] && echo "    💰 Payout: \$$PAYOUT"
  RESOLVED=$((RESOLVED + 1))
  sleep 2  # don't hammer Bankr
done <<< "$UNRESOLVED"

echo ""
echo "🏁 Redemption sweep: $RESOLVED resolved, $STILL_OPEN still open"
