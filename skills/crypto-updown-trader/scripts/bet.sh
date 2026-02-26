#!/bin/bash
# BTC 15-min bet: analyze → signal → bet → log
# Usage: ./bet.sh UP|DOWN [amount] [market_title] [score]
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

# ── Find current 15-min market ──
if [ -z "$MARKET_TITLE" ]; then
  MARKET_RESULT=$(python3 -c "
import json, sys, subprocess
from datetime import datetime, timezone, timedelta

now = datetime.now(timezone.utc)
et = timezone(timedelta(hours=-5))
now_et = now.astimezone(et)

wm = (now_et.minute // 15) * 15
window_start = now_et.replace(minute=wm, second=0, microsecond=0)
ts = int(window_start.astimezone(timezone.utc).timestamp())

for offset in [0, -900]:
    slug = f'btc-updown-15m-{ts + offset}'
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
  echo "❌ No CURRENTLY ACTIVE 15-min BTC market"
  echo "{\"time\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"direction\":\"$DIRECTION\",\"amount\":\"$AMOUNT\",\"market\":\"NONE\",\"result\":\"no current market\"}" >> "$DIR/bets.jsonl"
  exit 1
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "📋 Market: $MARKET_TITLE"
echo "🎯 Betting \$${AMOUNT} ${DIRECTION} @ ${TIMESTAMP}"

# ── Step 1: Broadcast signal to botchan FIRST (before Bankr call) ──
SIGNAL_MSG="🎯 BTC 15m | ${DIRECTION}"
[ -n "$SCORE" ] && SIGNAL_MSG="${SIGNAL_MSG} (score: ${SCORE})"
SIGNAL_MSG="${SIGNAL_MSG} | \$${AMOUNT} | ${MARKET_TITLE} | ${TIMESTAMP}"

echo "📡 Broadcasting signal..."
botchan post bets "$SIGNAL_MSG" --private-key "$PRIMARY_PRIVATE_KEY" 2>&1 &
SIGNAL_PID=$!

# Give signal 15s to send, don't let it block
( sleep 15 && kill $SIGNAL_PID 2>/dev/null ) &

# ── Step 2: Submit bet via Bankr (fire-and-forget with timeout) ──
echo "💰 Submitting bet to Bankr..."
BANKR_PROMPT="Buy \$${AMOUNT} of ${DIRECTION} shares for \"${MARKET_TITLE}\" on Polymarket. Execute the trade."

# Use bankr-submit.sh for async submission (returns jobId immediately)
SUBMIT_RESULT=$(bash "$DIR/../skills/bankr/scripts/bankr-submit.sh" "$BANKR_PROMPT" 2>&1 || true)
echo "   Bankr: $SUBMIT_RESULT"

# Extract jobId for later verification
JOB_ID=$(echo "$SUBMIT_RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('jobId',''))" 2>/dev/null || echo "")

# ── Step 3: Log everything ──
echo "{\"time\":\"$TIMESTAMP\",\"direction\":\"$DIRECTION\",\"amount\":\"$AMOUNT\",\"market\":\"$MARKET_TITLE\",\"slug\":\"${MARKET_SLUG:-}\",\"score\":\"${SCORE:-}\",\"jobId\":\"$JOB_ID\",\"result\":\"submitted\"}" >> "$DIR/bets.jsonl"

# Wait for signal to finish (up to remaining time)
wait $SIGNAL_PID 2>/dev/null || true

echo ""
echo "✅ Signal broadcast + bet submitted (jobId: $JOB_ID)"
echo "   Verify position in ~2 min"
