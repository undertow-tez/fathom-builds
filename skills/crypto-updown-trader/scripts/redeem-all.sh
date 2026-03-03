#!/bin/bash
# Redeem ALL unresolved bets from bets.jsonl
# Scans for any submitted bets without a corresponding redeem/result entry
# Run this at every cycle to clear the backlog

set -euo pipefail
source /home/ubuntu/.openclaw/workspace/.cron_env 2>/dev/null || true

DIR="$(cd "$(dirname "$0")" && pwd)"
BETS_FILE="$DIR/bets.jsonl"

if [ ! -f "$BETS_FILE" ]; then
  echo "No bets file found"
  exit 0
fi

echo "🔍 Scanning for unresolved bets..."

# Find all submitted bets and check which ones have been redeemed
SUBMITTED_SLUGS=$(grep '"result":"submitted"' "$BETS_FILE" | python3 -c "
import json, sys
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        d = json.loads(line)
        slug = d.get('slug', '')
        if slug: print(slug)
    except: pass
" | sort -u)

REDEEMED_SLUGS=$(grep '"action":"redeem"' "$BETS_FILE" | python3 -c "
import json, sys
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        d = json.loads(line)
        slug = d.get('slug', '')
        if slug: print(slug)
    except: pass
" | sort -u)

# Find unredeemed slugs
UNREDEEMED=$(comm -23 <(echo "$SUBMITTED_SLUGS") <(echo "$REDEEMED_SLUGS") 2>/dev/null || echo "$SUBMITTED_SLUGS")

if [ -z "$UNREDEEMED" ]; then
  echo "✅ All bets resolved — no backlog"
  exit 0
fi

COUNT=$(echo "$UNREDEEMED" | wc -l)
echo "📋 Found $COUNT unresolved bets — checking each..."
echo ""

RESOLVED=0
STILL_OPEN=0

while IFS= read -r SLUG; do
  [ -z "$SLUG" ] && continue
  
  # Extract timestamp from slug
  SLUG_TS=$(echo "$SLUG" | sed 's/.*-//')
  
  echo "  Checking: $SLUG"
  
  # Query market
  MARKET_DATA=$(curl -s "https://gamma-api.polymarket.com/markets?slug=${SLUG}" 2>/dev/null)
  
  STATUS=$(echo "$MARKET_DATA" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if not data:
    print('NOTFOUND')
    sys.exit(0)
m = data[0]
closed = m.get('closed', False)
prices = m.get('outcomePrices', '[]')
import json as j
p = j.loads(prices) if isinstance(prices, str) else prices
up_price = float(p[0]) if p else 0
down_price = float(p[1]) if p else 0
if not closed:
    print('OPEN')
elif up_price > 0.9:
    print('UP')
elif down_price > 0.9:
    print('DOWN')
else:
    print('UNKNOWN')
" 2>&1)

  if [ "$STATUS" = "OPEN" ] || [ "$STATUS" = "NOTFOUND" ] || [ "$STATUS" = "UNKNOWN" ]; then
    echo "    ⏳ Still open or not found"
    STILL_OPEN=$((STILL_OPEN + 1))
    continue
  fi
  
  WINNER="$STATUS"
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  
  # Find our bet direction and amount
  OUR_BET=$(grep "$SLUG" "$BETS_FILE" | grep '"result":"submitted"' | tail -1)
  OUR_DIR=$(echo "$OUR_BET" | python3 -c "import json,sys; print(json.load(sys.stdin).get('direction',''))" 2>/dev/null || echo "")
  OUR_AMT=$(echo "$OUR_BET" | python3 -c "import json,sys; print(json.load(sys.stdin).get('amount',''))" 2>/dev/null || echo "")
  MARKET_TITLE=$(echo "$OUR_BET" | python3 -c "import json,sys; print(json.load(sys.stdin).get('market',''))" 2>/dev/null || echo "$SLUG")
  
  if [ "$OUR_DIR" = "$WINNER" ]; then
    RESULT_MSG="✅ WON"
    echo "    ✅ WON! ($OUR_DIR = $WINNER) — redeeming \$$OUR_AMT"
  else
    RESULT_MSG="❌ LOST"
    echo "    ❌ LOST ($OUR_DIR vs $WINNER) — redeeming to clear"
  fi
  
  # Submit redeem to Bankr
  REDEEM_RESULT=$(bash "$DIR/../skills/bankr/scripts/bankr-submit.sh" "Redeem my position on '${MARKET_TITLE}' on Polymarket" 2>&1 || true)
  REDEEM_JOB=$(echo "$REDEEM_RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('jobId',''))" 2>/dev/null || echo "unknown")
  
  # Log result
  echo "{\"time\":\"$TIMESTAMP\",\"slug\":\"$SLUG\",\"market\":\"$MARKET_TITLE\",\"action\":\"redeem\",\"winner\":\"$WINNER\",\"ourBet\":\"$OUR_DIR\",\"amount\":\"$OUR_AMT\",\"result\":\"$RESULT_MSG\",\"redeemJob\":\"$REDEEM_JOB\"}" >> "$BETS_FILE"
  
  RESOLVED=$((RESOLVED + 1))
  sleep 2  # Don't hammer Bankr API
  
done <<< "$UNREDEEMED"

echo ""
echo "🏁 Redemption sweep done: $RESOLVED resolved, $STILL_OPEN still open"
