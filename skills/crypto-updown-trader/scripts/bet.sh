#!/bin/bash
# Crypto Up/Down bet: analyze → signal → bet → log
# Usage: ./bet.sh UP|DOWN [amount] [market_title] [score] [asset] [timeframe]
#
# Flow: find market → broadcast signal → submit bet (fire-and-forget) → log
# Signal goes out BEFORE Bankr call so it never gets blocked by API hangs

set -euo pipefail
source /home/ubuntu/.openclaw/workspace/.cron_env 2>/dev/null || true

DIR="$(cd "$(dirname "$0")" && pwd)"
DIRECTION="${1:-UP}"
AMOUNT="${2:-3}"
MARKET_TITLE="${3:-}"
SCORE="${4:-}"
ASSET="${5:-btc}"
TIMEFRAME="${6:-15m}"

# Asset slug mapping
case "$ASSET" in
  btc) ASSET_SLUG="btc"; ASSET_NAME="Bitcoin" ;;
  eth) ASSET_SLUG="eth"; ASSET_NAME="Ethereum" ;;
  sol) ASSET_SLUG="sol"; ASSET_NAME="Solana" ;;
  xrp) ASSET_SLUG="xrp"; ASSET_NAME="XRP" ;;
  *) echo "❌ Unknown asset: $ASSET"; exit 1 ;;
esac

# Timeframe → window minutes
case "$TIMEFRAME" in
  5m)  WINDOW_MINUTES=5 ;;
  15m) WINDOW_MINUTES=15 ;;
  *) echo "❌ Unknown timeframe: $TIMEFRAME"; exit 1 ;;
esac

# ── Duplicate bet prevention (lock per asset+timeframe+window) ──
WINDOW_TS=$(python3 -c "
from datetime import datetime, timezone, timedelta
now = datetime.now(timezone.utc)
et = timezone(timedelta(hours=-5))
now_et = now.astimezone(et)
wm = (now_et.minute // $WINDOW_MINUTES) * $WINDOW_MINUTES
ws = now_et.replace(minute=wm, second=0, microsecond=0)
print(int(ws.astimezone(timezone.utc).timestamp()))
" 2>/dev/null)
LOCK_FILE="$DIR/.lock_${ASSET_SLUG}_${TIMEFRAME}_${WINDOW_TS}"
if [ -f "$LOCK_FILE" ]; then
  echo "🔒 Bet already placed for ${ASSET_SLUG} ${TIMEFRAME} this window (lock: $LOCK_FILE). Skipping duplicate."
  exit 0
fi
touch "$LOCK_FILE"
# Clean old lock files (>1 hour old)
find "$DIR" -name '.lock_*' -mmin +60 -delete 2>/dev/null || true

# ── Find current market ──
if [ -z "$MARKET_TITLE" ]; then
  MARKET_RESULT=$(python3 -c "
import json, sys, subprocess
from datetime import datetime, timezone, timedelta

now = datetime.now(timezone.utc)
et = timezone(timedelta(hours=-5))
now_et = now.astimezone(et)

wm = (now_et.minute // $WINDOW_MINUTES) * $WINDOW_MINUTES
window_start = now_et.replace(minute=wm, second=0, microsecond=0)
ts = int(window_start.astimezone(timezone.utc).timestamp())

for offset in [0, -($WINDOW_MINUTES * 60)]:
    slug = f'${ASSET_SLUG}-updown-${TIMEFRAME}-{ts + offset}'
    try:
        r = subprocess.run(['curl', '-s', f'https://gamma-api.polymarket.com/markets?slug={slug}'],
                          capture_output=True, text=True, timeout=10)
        data = json.loads(r.stdout)
        if data:
            m = data[0]
            title = m.get('question', m.get('title', ''))
            end_date = m.get('endDate', '')
            if title and not m.get('closed', False):
                if end_date:
                    end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                    if end_dt > now + timedelta(minutes=2):
                        print(f'CURRENT|{title}|{slug}')
                        sys.exit(0)
    except Exception as e:
        pass

print(f'NONE|No active market|')
" 2>&1)

  MARKET_STATUS=$(echo "$MARKET_RESULT" | cut -d'|' -f1)
  MARKET_TITLE=$(echo "$MARKET_RESULT" | cut -d'|' -f2)
  MARKET_SLUG=$(echo "$MARKET_RESULT" | cut -d'|' -f3)
fi

if [ -z "$MARKET_TITLE" ] || [ "$MARKET_STATUS" = "NONE" ]; then
  echo "❌ No CURRENTLY ACTIVE ${ASSET_NAME} ${TIMEFRAME} market"
  echo "{\"time\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"asset\":\"$ASSET\",\"timeframe\":\"$TIMEFRAME\",\"direction\":\"$DIRECTION\",\"amount\":\"$AMOUNT\",\"market\":\"NONE\",\"result\":\"no current market\"}" >> "$DIR/bets.jsonl"
  rm -f "$LOCK_FILE"
  exit 1
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "📋 Market: $MARKET_TITLE"
echo "🎯 Betting \$${AMOUNT} ${DIRECTION} @ ${TIMESTAMP}"

# ── Step 1: Broadcast signal to botchan FIRST ──
SIGNAL_MSG="🎯 ${ASSET_NAME} ${TIMEFRAME} | ${DIRECTION}"
[ -n "$SCORE" ] && SIGNAL_MSG="${SIGNAL_MSG} (score: ${SCORE})"
SIGNAL_MSG="${SIGNAL_MSG} | \$${AMOUNT} | ${MARKET_TITLE} | ${TIMESTAMP}"

echo "📡 Broadcasting signal..."
botchan post bets "$SIGNAL_MSG" --private-key "$PRIMARY_PRIVATE_KEY" 2>&1 &
SIGNAL_PID=$!
( sleep 15 && kill $SIGNAL_PID 2>/dev/null ) &

# ── Step 2: Submit bet via Bankr (fire-and-forget) ──
echo "💰 Submitting bet to Bankr..."
BANKR_PROMPT="Buy \$${AMOUNT} of ${DIRECTION} shares for \"${MARKET_TITLE}\" on Polymarket. Execute the trade."

SUBMIT_RESULT=$(bash "$DIR/../skills/bankr/scripts/bankr-submit.sh" "$BANKR_PROMPT" 2>&1 || true)
echo "   Bankr: $SUBMIT_RESULT"

JOB_ID=$(echo "$SUBMIT_RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('jobId',''))" 2>/dev/null || echo "")

# ── Step 3: Log ──
echo "{\"time\":\"$TIMESTAMP\",\"asset\":\"$ASSET\",\"timeframe\":\"$TIMEFRAME\",\"direction\":\"$DIRECTION\",\"amount\":\"$AMOUNT\",\"market\":\"$MARKET_TITLE\",\"slug\":\"${MARKET_SLUG:-}\",\"score\":\"${SCORE:-}\",\"jobId\":\"$JOB_ID\",\"result\":\"submitted\"}" >> "$DIR/bets.jsonl"

wait $SIGNAL_PID 2>/dev/null || true

echo ""
echo "✅ Signal broadcast + bet submitted (jobId: $JOB_ID)"
echo "   Verify position in ~2 min"
