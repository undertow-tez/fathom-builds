#!/bin/bash
# BTC 15-min redeem: check if a market resolved, redeem if won
# Usage: ./redeem.sh [slug_timestamp]
#
# If no timestamp given, checks the previous 15-min window
# Posts result to botchan bets feed

set -euo pipefail
source /home/ubuntu/.openclaw/workspace/.cron_env 2>/dev/null || true

DIR="$(cd "$(dirname "$0")" && pwd)"
SLUG_TS="${1:-}"

# Calculate previous window's slug timestamp if not provided
if [ -z "$SLUG_TS" ]; then
  SLUG_TS=$(python3 -c "
from datetime import datetime, timezone, timedelta
now = datetime.now(timezone.utc)
et = timezone(timedelta(hours=-5))
now_et = now.astimezone(et)
# Previous 15-min window
wm = (now_et.minute // 15) * 15
window_start = now_et.replace(minute=wm, second=0, microsecond=0) - timedelta(minutes=15)
print(int(window_start.astimezone(timezone.utc).timestamp()))
")
fi

SLUG="btc-updown-15m-${SLUG_TS}"
echo "🔍 Checking resolution for slug: $SLUG"

# Query market status
MARKET_DATA=$(curl -s "https://gamma-api.polymarket.com/markets?slug=${SLUG}" 2>/dev/null)
MARKET_INFO=$(echo "$MARKET_DATA" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if not data:
    print('NOTFOUND|||')
    sys.exit(0)
m = data[0]
title = m.get('question', '')
closed = m.get('closed', False)
prices = m.get('outcomePrices', '[]')
# Parse prices: [\"1\", \"0\"] means UP won, [\"0\", \"1\"] means DOWN won
import json as j
p = j.loads(prices) if isinstance(prices, str) else prices
up_price = float(p[0]) if p else 0
down_price = float(p[1]) if p else 0

if not closed:
    print(f'OPEN|{title}|{up_price}|{down_price}')
elif up_price > 0.9:
    print(f'UP_WON|{title}|{up_price}|{down_price}')
elif down_price > 0.9:
    print(f'DOWN_WON|{title}|{up_price}|{down_price}')
else:
    print(f'UNKNOWN|{title}|{up_price}|{down_price}')
" 2>&1)

STATUS=$(echo "$MARKET_INFO" | cut -d'|' -f1)
TITLE=$(echo "$MARKET_INFO" | cut -d'|' -f2)
UP_PRICE=$(echo "$MARKET_INFO" | cut -d'|' -f3)
DOWN_PRICE=$(echo "$MARKET_INFO" | cut -d'|' -f4)

echo "   Market: $TITLE"
echo "   Status: $STATUS (UP=$UP_PRICE, DOWN=$DOWN_PRICE)"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

case "$STATUS" in
  OPEN)
    echo "⏳ Market still open — not resolved yet"
    echo "{\"time\":\"$TIMESTAMP\",\"slug\":\"$SLUG\",\"market\":\"$TITLE\",\"action\":\"redeem_check\",\"result\":\"still open\"}" >> "$DIR/bets.jsonl"
    exit 0
    ;;
  NOTFOUND)
    echo "❌ Market not found for slug $SLUG"
    exit 1
    ;;
  UP_WON|DOWN_WON)
    WINNER=$([ "$STATUS" = "UP_WON" ] && echo "UP" || echo "DOWN")
    echo "🏆 Market resolved: $WINNER won!"
    
    # Check if we had a bet on this market (search bets.jsonl)
    OUR_BET=$(grep "$SLUG\|$TITLE" "$DIR/bets.jsonl" 2>/dev/null | grep -v "redeem\|no current" | tail -1 || true)
    if [ -z "$OUR_BET" ]; then
      echo "   No bet found for this market — skipping redeem"
      exit 0
    fi
    
    OUR_DIR=$(echo "$OUR_BET" | python3 -c "import json,sys; print(json.load(sys.stdin).get('direction',''))" 2>/dev/null || echo "")
    OUR_AMT=$(echo "$OUR_BET" | python3 -c "import json,sys; print(json.load(sys.stdin).get('amount',''))" 2>/dev/null || echo "")
    
    if [ "$OUR_DIR" = "$WINNER" ]; then
      echo "   ✅ We bet $WINNER — WE WON! Redeeming..."
      RESULT_MSG="✅ WON"
    else
      echo "   ❌ We bet $OUR_DIR but $WINNER won — LOST"
      RESULT_MSG="❌ LOST"
    fi
    
    # Try to redeem regardless (Bankr handles it)
    echo "💰 Submitting redeem to Bankr..."
    REDEEM_RESULT=$(bash "$DIR/../skills/bankr/scripts/bankr-submit.sh" "Redeem my position on '${TITLE}' on Polymarket" 2>&1 || true)
    REDEEM_JOB=$(echo "$REDEEM_RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('jobId',''))" 2>/dev/null || echo "")
    echo "   Redeem jobId: $REDEEM_JOB"
    
    # Broadcast result to botchan
    RESULT_SIGNAL="${RESULT_MSG} BTC 15m | ${WINNER} won | Our bet: ${OUR_DIR} \$${OUR_AMT} | ${TITLE}"
    echo "📡 Broadcasting result..."
    botchan post bets "$RESULT_SIGNAL" --private-key "$PRIMARY_PRIVATE_KEY" 2>&1 || true
    
    # Log
    echo "{\"time\":\"$TIMESTAMP\",\"slug\":\"$SLUG\",\"market\":\"$TITLE\",\"action\":\"redeem\",\"winner\":\"$WINNER\",\"ourBet\":\"$OUR_DIR\",\"amount\":\"$OUR_AMT\",\"result\":\"$RESULT_MSG\",\"redeemJob\":\"$REDEEM_JOB\"}" >> "$DIR/bets.jsonl"
    
    echo ""
    echo "🏁 ${RESULT_MSG} | Bet: \$${OUR_AMT} ${OUR_DIR} | Winner: ${WINNER}"
    ;;
  *)
    echo "❓ Unknown status: $STATUS"
    exit 1
    ;;
esac
