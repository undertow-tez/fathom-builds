#!/bin/bash
# cycle-v2.sh — the v2 (probability/EV) machine cycle.
# Called by cron at :08/:23/:38/:53. Runs the model engine per asset.
#
#   mode=shadow (default): evaluate + log to windows.jsonl, place NO real bets.
#   mode=live: also place the emitted bet via bet.sh.
#
# There are NO phantom bets: strategy-v2.js applies every gate before it logs a
# decision, and this script only ever acts on the signal it actually emitted.

set -euo pipefail
source ~/.openclaw/workspace/.cron_env 2>/dev/null || true

DIR="$(cd "$(dirname "$0")" && pwd)"
CFG="$DIR/config.json"

# Machine on/off flag (same convention as v1)
[ -f "$DIR/.enabled" ] || exit 0

MODE=$(node -e "try{const c=require('$CFG');console.log((c.v2&&c.v2.mode)||'shadow')}catch(e){console.log('shadow')}")
ASSETS=$(node -e "try{const c=require('$CFG');const a=c.assets||[c.asset||'btc'];console.log(a.join(' '))}catch(e){console.log('btc')}")
TF=$(node -e "try{const c=require('$CFG');console.log(c.timeframe||'15m')}catch(e){console.log('15m')}")
TZ_DISP=$(node -e "try{const c=require('$CFG');console.log(c.timezone||'America/New_York')}catch(e){console.log('America/New_York')}")

echo "🔄 v2 cycle [$MODE] — $(date -u +'%Y-%m-%d %H:%M UTC') ($(TZ="$TZ_DISP" date +'%I:%M %p %Z'))"

# Settle any windows that have closed since last run (fills outcomes + paper P&L)
node "$DIR/resolve-windows.js" 2>/dev/null || true

for ASSET in $ASSETS; do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  OUT=$(node "$DIR/strategy-v2.js" --asset "$ASSET" --tf "$TF" --mode "$MODE" 2>&1)
  echo "$OUT"

  SIG=$(echo "$OUT" | grep '^__SIGNAL_V2__:' | tail -1 || true)
  [ -z "$SIG" ] && { echo "⚠️  no signal for $ASSET"; continue; }

  DECISION=$(echo "$SIG" | cut -d: -f2)
  SIDE=$(echo "$SIG" | cut -d: -f3)
  SIZE=$(echo "$SIG" | cut -d: -f4)
  PRICE=$(echo "$SIG" | cut -d: -f5)

  if [ "$MODE" = "live" ] && [ "$DECISION" != "NO_BET" ] && [ "$SIDE" != "NONE" ]; then
    echo "🚀 LIVE: $SIDE \$$SIZE for $ASSET (price $PRICE)"
    # bet.sh signature: UP|DOWN [amount] [market_title] [score] [asset] [timeframe]
    bash "$DIR/bet.sh" "$SIDE" "$SIZE" "" "p=$PRICE" "$ASSET" "$TF" || true
  fi
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ v2 cycle complete ($MODE)"
