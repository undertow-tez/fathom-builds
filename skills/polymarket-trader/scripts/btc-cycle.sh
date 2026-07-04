#!/bin/bash
# BTC Up/Down 15-min cycle: guards → redeem sweep → analyze → bet.
# Cron this at :08/:23/:38/:53 (8 min into each window — market exists, plenty of time left).
#
# Usage: ./btc-cycle.sh [--bet-size 5] [--dry-run]

set -euo pipefail
source ~/.openclaw/workspace/.cron_env 2>/dev/null || true

DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$DIR/../config.json"

# ── Machine switch ──
[ -f "$DIR/.enabled-btc" ] || exit 0

BET_SIZE=""
DRY_RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --bet-size) BET_SIZE="$2"; shift 2 ;;
    --dry-run)  DRY_RUN=1; shift ;;
    *) shift ;;
  esac
done
[ -z "$BET_SIZE" ] && BET_SIZE=$(jq -r '.btc.betSize // 5' "$CONFIG" 2>/dev/null || echo 5)

echo "🔄 BTC Up/Down Cycle — $(date -u +'%Y-%m-%d %H:%M UTC')"

# ── Redeem sweep first (clears backlog, updates P&L) ──
bash "$DIR/redeem-all.sh" 2>&1 || true

# ── Guard: shared daily loss limit ──
DAILY_LIMIT=$(jq -r '.dailyLossLimit // 20' "$CONFIG" 2>/dev/null || echo 20)
NET_TODAY=$(node "$DIR/pnl.js" --today --json 2>/dev/null | jq -r '.totals.net // 0' || echo 0)
echo "📊 Today's net P&L (all strategies): \$${NET_TODAY} (limit: -\$${DAILY_LIMIT})"
if python3 -c "exit(0 if float('${NET_TODAY}') < -float('${DAILY_LIMIT}') else 1)" 2>/dev/null; then
  echo "🛑 DAILY LOSS LIMIT hit — no more bets today"
  exit 0
fi

# ── Guard: midday blackout (always ET — US market dead zone is global for crypto) ──
BLACKOUT=$(jq -c '.btc.blackoutHoursET // [11,12,13]' "$CONFIG" 2>/dev/null || echo '[11,12,13]')
ET_HOUR=$(TZ=America/New_York date +'%-H')
if echo "$BLACKOUT" | jq -e --argjson h "$ET_HOUR" 'index($h) != null' >/dev/null 2>&1; then
  echo "⏸️  BLACKOUT hour ${ET_HOUR} ET (config: ${BLACKOUT}) — historically terrible win rate, sitting out"
  exit 0
fi

# ── Guard: cooldown after 2 consecutive losses ──
COOLDOWN_MIN=$(jq -r '.btc.cooldownMinutes // 30' "$CONFIG" 2>/dev/null || echo 30)
COOLDOWN_FILE="$DIR/.cooldown-btc"
if [ -f "$COOLDOWN_FILE" ]; then
  AGE=$(( $(date +%s) - $(stat -c %Y "$COOLDOWN_FILE") ))
  if [ "$AGE" -le $(( COOLDOWN_MIN * 60 )) ]; then
    echo "🧊 COOLDOWN — $(( (COOLDOWN_MIN * 60 - AGE) / 60 )) min remaining"
    exit 0
  fi
  rm -f "$COOLDOWN_FILE"
fi
LAST_TWO=$(grep '"action":"redeem"' "$DIR/bets.jsonl" 2>/dev/null | grep '"strategy":"btc"' | tail -2 | \
  jq -rs 'map(if (.result | contains("WON")) then "W" else "L" end) | join("")' 2>/dev/null || echo "")
if [ "$LAST_TWO" = "LL" ] && [ ! -f "$COOLDOWN_FILE" ]; then
  # Only trigger if the most recent loss is fresh (avoid re-triggering on old history)
  LAST_TIME=$(grep '"action":"redeem"' "$DIR/bets.jsonl" 2>/dev/null | grep '"strategy":"btc"' | tail -1 | jq -r '.time' 2>/dev/null || echo "")
  if [ -n "$LAST_TIME" ]; then
    LOSS_AGE=$(( $(date +%s) - $(date -d "$LAST_TIME" +%s 2>/dev/null || echo 0) ))
    if [ "$LOSS_AGE" -lt $(( COOLDOWN_MIN * 60 )) ]; then
      touch "$COOLDOWN_FILE"
      echo "🧊 COOLDOWN: 2 consecutive losses — pausing ${COOLDOWN_MIN} min"
      exit 0
    fi
  fi
fi

# ── Analyze each configured asset ──
ASSETS=$(jq -r '(.btc.assets // ["btc"]) | join(" ")' "$CONFIG" 2>/dev/null || echo "btc")
for ASSET in $ASSETS; do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  OUTPUT=$(node "$DIR/btc-strategy.js" --asset "$ASSET" --config "$CONFIG" 2>&1 || true)
  echo "$OUTPUT"

  SIGNAL=$(echo "$OUTPUT" | grep '^__SIGNAL__:' | tail -1 | sed 's/^__SIGNAL__://')
  [ -z "$SIGNAL" ] && { echo "❌ No signal for $ASSET"; continue; }

  DECISION=$(echo "$SIGNAL" | jq -r '.decision')
  if [ "$DECISION" = "NO_BET" ]; then
    echo "⏸️  $ASSET: no edge — skipping this window"
    continue
  fi

  SLUG=$(echo "$SIGNAL" | jq -r '.slug')
  QUESTION=$(echo "$SIGNAL" | jq -r '.question')
  SCORE=$(echo "$SIGNAL" | jq -r '.score')
  DIRECTION=$([ "$DECISION" = "BET_UP" ] && echo "UP" || echo "DOWN")
  OUTCOME_INDEX=$([ "$DIRECTION" = "UP" ] && echo 0 || echo 1)

  if [ "$DRY_RUN" = "1" ]; then
    echo "🧪 [DRY RUN] Would bet \$${BET_SIZE} ${DIRECTION} on: $QUESTION"
    continue
  fi

  echo "🚀 Executing: ${DIRECTION} \$${BET_SIZE} (score ${SCORE})"
  bash "$DIR/bet.sh" \
    --strategy btc --slug "$SLUG" --question "$QUESTION" \
    --outcome "$DIRECTION" --outcome-index "$OUTCOME_INDEX" \
    --amount "$BET_SIZE" --meta "$(echo "$SIGNAL" | jq -c '{score, rsi, vol, hourly}')"
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ BTC cycle complete"
