#!/bin/bash
# BTC 15-min full cycle: analyze → bet → log
# Called at :08/:23/:38/:53 of each hour (8 min into each window)
# Redeem is handled separately by redeem.sh at :20/:35/:50/:05
#
# Usage: ./cycle.sh [--bet-size 3]

set -euo pipefail
source /home/ubuntu/.openclaw/workspace/.cron_env 2>/dev/null || true

DIR="$(cd "$(dirname "$0")" && pwd)"
BET_SIZE="${2:-3}"

# Parse args
for arg in "$@"; do
  case "$arg" in
    --bet-size) shift; BET_SIZE="${1:-3}" ;;
  esac
done

TIMEZONE=$(node -e "const c=require('$(cd "$(dirname "$0")" && pwd)/config.json'); console.log(c.timezone || 'America/New_York')" 2>/dev/null || echo "America/New_York")
echo "🔄 BTC 15-Min Cycle — $(date -u +'%Y-%m-%d %H:%M UTC') ($(TZ="$TIMEZONE" date +'%I:%M %p %Z'))"
echo ""

# Check previous skips against resolved outcomes
echo "🔍 Checking skip outcomes..."
node "$DIR/skip-tracker.js" --check 2>/dev/null || true
echo ""

# ── Step 1: Multi-asset support ──
# Read assets array from config (fallback to single "asset" field)
ASSETS=$(node -e "const c=require('$DIR/config.json'); const a=c.assets||[c.asset||'btc']; console.log(a.join(' '))")

for ASSET in $ASSETS; do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📊 Running momentum analysis for $(echo $ASSET | tr '[:lower:]' '[:upper:]')..."
  STRATEGY_OUTPUT=$(node "$DIR/strategy.js" --asset "$ASSET" --bet-size "$BET_SIZE" 2>&1)
  echo "$STRATEGY_OUTPUT"

  # Parse signal
  SIGNAL_LINE=$(echo "$STRATEGY_OUTPUT" | grep "^__SIGNAL__:" | tail -1)
  if [ -z "$SIGNAL_LINE" ]; then
    echo "❌ No signal parsed from strategy for $ASSET"
    continue
  fi

  DECISION=$(echo "$SIGNAL_LINE" | cut -d: -f2)
  SCORE=$(echo "$SIGNAL_LINE" | cut -d: -f3)
  PRICE=$(echo "$SIGNAL_LINE" | cut -d: -f4)

  echo ""
  echo "📈 Signal: $DECISION (score: $SCORE, $(echo $ASSET | tr '[:lower:]' '[:upper:]'): \$$PRICE)"

# ── Step 2: Redeem ALL unresolved bets (not just previous window) ──
echo ""
echo "🔍 Sweeping all unresolved bets for redemption..."
bash "$DIR/redeem-all.sh" 2>&1 || true

# ── Step 2b: Drawdown pause check ──
# Read drawdownLimit from config (default 15 if not set)
DRAWDOWN_LIMIT=$(node -e "const c=require('$DIR/config.json'); console.log(c.drawdownLimit || 15)")
TODAY=$(date -u +'%Y-%m-%d')
TODAY_LOSSES=$(grep "$TODAY" "$DIR/bets.jsonl" 2>/dev/null | grep "❌ LOST" | python3 -c "
import json, sys
total = 0
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        d = json.loads(line)
        total += float(d.get('amount', 0))
    except: pass
print(total)
" 2>/dev/null || echo "0")
TODAY_WINS=$(grep "$TODAY" "$DIR/bets.jsonl" 2>/dev/null | grep "✅ WON" | python3 -c "
import json, sys
total = 0
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        d = json.loads(line)
        total += float(d.get('amount', 0))
    except: pass
print(total)
" 2>/dev/null || echo "0")
NET_PNL=$(python3 -c "print(round(float('${TODAY_WINS}') * 0.9 - float('${TODAY_LOSSES}'), 2))")
echo "📊 Today's P&L: +\$${TODAY_WINS} wins, -\$${TODAY_LOSSES} losses = net \$${NET_PNL}"
if python3 -c "exit(0 if float('${NET_PNL}') < -${DRAWDOWN_LIMIT} else 1)" 2>/dev/null; then
  echo "🛑 DRAWDOWN PAUSE: Net loss exceeds \$${DRAWDOWN_LIMIT} today — skipping bet"
  exit 0
fi

# ── Step 2c: Midday blackout ──
# Read blackoutHours from config (default [11,12,13] if not set)
BLACKOUT_HOURS=$(node -e "const c=require('$DIR/config.json'); console.log(JSON.stringify(c.blackoutHours || [11,12,13]))")
TIMEZONE=$(node -e "const c=require('$DIR/config.json'); console.log(c.timezone || 'America/New_York')")
CURRENT_LOCAL_HOUR=$(TZ="$TIMEZONE" date +'%H' | sed 's/^0//')
if echo "$BLACKOUT_HOURS" | grep -q "\b$CURRENT_LOCAL_HOUR\b"; then
  echo "⏸️  BLACKOUT (hours ${BLACKOUT_HOURS} in ${TIMEZONE}) — historically low win rate, sitting out"
  exit 0
fi

# ── Step 2d: Consecutive loss cooldown ──
# After 2 consecutive losses, skip for cooldownMinutes (default 30)
COOLDOWN_MINUTES=$(node -e "const c=require('$DIR/config.json'); console.log(c.cooldownMinutes || 30)")
COOLDOWN_SECONDS=$(( COOLDOWN_MINUTES * 60 ))
COOLDOWN_FILE="$DIR/.cooldown"
if [ -f "$COOLDOWN_FILE" ]; then
  COOLDOWN_AGE=$(( $(date +%s) - $(stat -c %Y "$COOLDOWN_FILE") ))
  if [ "$COOLDOWN_AGE" -le "$COOLDOWN_SECONDS" ]; then
    echo "🧊 COOLDOWN active — $(( (COOLDOWN_SECONDS - COOLDOWN_AGE) / 60 )) min remaining"
    exit 0
  else
    echo "🧊 Cooldown expired — resuming"
    rm -f "$COOLDOWN_FILE"
  fi
else
  # Check if last 2 resolved bets today were both losses
  LAST_TWO=$(grep "$TODAY" "$DIR/bets.jsonl" 2>/dev/null | grep -E "WON|LOST" | grep "action.*redeem" | tail -2 | python3 -c "
import json, sys
results = []
for line in sys.stdin:
    d = json.loads(line.strip())
    results.append('L' if '❌' in d.get('result','') else 'W')
# Only trigger if exactly 2 results and both losses
# AND no cooldown has been served yet for this streak
print(''.join(results))
" 2>/dev/null || echo "")
  if [ "$LAST_TWO" = "LL" ]; then
    # Check we haven't already served a cooldown after these losses
    LAST_LOSS_TIME=$(grep "$TODAY" "$DIR/bets.jsonl" 2>/dev/null | grep "❌ LOST" | grep "action.*redeem" | tail -1 | python3 -c "
import json,sys
d=json.loads(sys.stdin.readline().strip())
from datetime import datetime
t=datetime.fromisoformat(d['time'].replace('Z','+00:00'))
print(int(t.timestamp()))
" 2>/dev/null || echo "0")
    # Only start cooldown if the last loss was recent
    LOSS_AGE=$(( $(date +%s) - LAST_LOSS_TIME ))
    if [ "$LOSS_AGE" -lt "$COOLDOWN_SECONDS" ]; then
      touch "$COOLDOWN_FILE"
      echo "🧊 COOLDOWN: 2 consecutive losses — pausing $COOLDOWN_MINUTES min"
      exit 0
    fi
    # If losses are old, cooldown already implicitly served — resume
  fi
fi

  # ── Step 3: Execute bet if signal is good ──
  if [ "$DECISION" = "NO_BET" ]; then
    echo ""
    echo "⏸️  No edge detected for $ASSET — skipping this window"
    # Log skip for counterfactual analysis
    RSI=$(echo "$STRATEGY_OUTPUT" | grep "RSI:" | head -1 | sed 's/.*RSI: \([0-9.]*\).*/\1/')
    VOL=$(echo "$STRATEGY_OUTPUT" | grep "Vol:" | head -1 | sed 's/.*Vol: \([0-9.]*\).*/\1/')
    MA_ALIGN="mixed"
    echo "$STRATEGY_OUTPUT" | grep -q "MA5>MA10>MA20" && MA_ALIGN="bullish"
    echo "$STRATEGY_OUTPUT" | grep -q "MA5<MA10<MA20" && MA_ALIGN="bearish"
    DIR5=$(echo "$STRATEGY_OUTPUT" | grep "5-candle" | head -1 | sed 's/.*: \([0-9/]* UP\).*/\1/')
    node "$DIR/skip-tracker.js" --log --asset "$ASSET" --price "$PRICE" --score "$SCORE" --rsi "${RSI:-0}" --vol "${VOL:-0}" --ma "$MA_ALIGN" --dir5 "${DIR5:-}" 2>/dev/null || true
  else
    DIRECTION=$([ "$DECISION" = "BET_UP" ] && echo "UP" || echo "DOWN")
    echo ""
    echo "🚀 Executing: $DIRECTION \$${BET_SIZE} for $ASSET (score: $SCORE)"
    bash "$DIR/bet.sh" "$DIRECTION" "$BET_SIZE" "" "$SCORE"
  fi
  echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Multi-asset cycle complete"
