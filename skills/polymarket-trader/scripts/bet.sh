#!/bin/bash
# Generic Polymarket bet via Bankr — used by both the BTC and weather machines.
#
# Usage:
#   ./bet.sh --strategy btc     --slug <marketSlug> --question "<title>" --outcome UP  --outcome-index 0 --amount 5   [--meta '<json>']
#   ./bet.sh --strategy weather --slug <marketSlug> --question "<title>" --outcome YES --outcome-index 0 --amount 10  [--meta '<json>']
#
# What it does:
#   1. Lock file per market slug — hard duplicate prevention
#   2. Submit "Buy $X of <OUTCOME> shares for "<title>" on Polymarket" to Bankr (fire-and-forget)
#   3. Log the bet to bets.jsonl with outcomeIndex so redeem-all.sh can resolve it generically
#   4. Background-poll the Bankr job to capture confirmed share count
#
# HARD RULE: exactly ONE Bankr call per bet. Duplicates cost real money.

set -euo pipefail
source ~/.openclaw/workspace/.cron_env 2>/dev/null || true

DIR="$(cd "$(dirname "$0")" && pwd)"
source "$DIR/lib/bankr.sh"

STRATEGY="" SLUG="" QUESTION="" OUTCOME="" OUTCOME_INDEX="" AMOUNT="" META="{}" PRICE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --strategy)      STRATEGY="$2"; shift 2 ;;
    --slug)          SLUG="$2"; shift 2 ;;
    --question)      QUESTION="$2"; shift 2 ;;
    --outcome)       OUTCOME="$2"; shift 2 ;;
    --outcome-index) OUTCOME_INDEX="$2"; shift 2 ;;
    --amount)        AMOUNT="$2"; shift 2 ;;
    --price)         PRICE="$2"; shift 2 ;;
    --meta)          META="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

for req in STRATEGY SLUG QUESTION OUTCOME OUTCOME_INDEX AMOUNT; do
  if [ -z "${!req}" ]; then echo "❌ Missing --$(echo "$req" | tr '[:upper:]_' '[:lower:]-')" >&2; exit 1; fi
done

BETS_FILE="$DIR/bets.jsonl"

# ── Duplicate prevention: one bet per market, ever ──
LOCK_FILE="$DIR/.lock_$(echo "$SLUG" | tr -c 'a-zA-Z0-9' '_')"
if [ -f "$LOCK_FILE" ]; then
  echo "🔒 Already bet on $SLUG (lock exists). Skipping duplicate."
  exit 0
fi
if grep -q "\"slug\":\"$SLUG\"" "$BETS_FILE" 2>/dev/null; then
  echo "🔒 Already bet on $SLUG (found in bets.jsonl). Skipping duplicate."
  exit 0
fi
touch "$LOCK_FILE"
# Clean lock files older than 2 days (markets long resolved by then)
find "$DIR" -name '.lock_*' -mtime +2 -delete 2>/dev/null || true

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "📋 Market: $QUESTION"
echo "🎯 Betting \$${AMOUNT} on ${OUTCOME} @ ${TIMESTAMP}"

# ── Submit to Bankr (fire-and-forget) ──
BANKR_PROMPT="Buy \$${AMOUNT} of ${OUTCOME} shares for \"${QUESTION}\" on Polymarket. Execute the trade."
echo "💰 Submitting to Bankr..."
SUBMIT_RESULT=$(bankr_submit "$BANKR_PROMPT" 2>&1 || true)
echo "   Bankr: $SUBMIT_RESULT"
JOB_ID=$(echo "$SUBMIT_RESULT" | jq -r '.jobId // empty' 2>/dev/null || echo "")

if [ -z "$JOB_ID" ]; then
  echo "⚠️  No jobId returned — bet may not have been submitted. Check Bankr manually before retrying."
fi

# ── Log ──
jq -nc \
  --arg time "$TIMESTAMP" --arg strategy "$STRATEGY" --arg slug "$SLUG" \
  --arg market "$QUESTION" --arg outcome "$OUTCOME" --argjson outcomeIndex "$OUTCOME_INDEX" \
  --arg amount "$AMOUNT" --arg price "${PRICE:-}" --arg jobId "$JOB_ID" --argjson meta "$META" \
  '{time:$time, strategy:$strategy, slug:$slug, market:$market, outcome:$outcome,
    outcomeIndex:$outcomeIndex, amount:$amount, price:$price, jobId:$jobId, meta:$meta,
    result:"submitted"}' >> "$BETS_FILE"

echo "✅ Bet submitted (jobId: ${JOB_ID:-none})"

# ── Background: poll job to confirm share count, patch the log entry ──
if [ -n "$JOB_ID" ]; then
  (
    RESULT_TEXT=$(bankr_poll "$JOB_ID" 300 2>/dev/null || echo "")
    if [ -n "$RESULT_TEXT" ]; then
      SHARES=$(echo "$RESULT_TEXT" | grep -oiE '[0-9]+\.?[0-9]*[[:space:]]+shares' | head -1 | grep -oE '[0-9]+\.?[0-9]*' | head -1 || echo "")
      if [ -n "$SHARES" ]; then
        python3 - "$BETS_FILE" "$JOB_ID" "$SHARES" <<'PYEOF'
import json, sys
path, job_id, shares = sys.argv[1], sys.argv[2], sys.argv[3]
lines = open(path).read().splitlines()
out = []
for line in lines:
    try:
        d = json.loads(line)
        if d.get('jobId') == job_id and d.get('result') == 'submitted':
            d['shares'] = shares
            line = json.dumps(d)
    except Exception:
        pass
    out.append(line)
open(path, 'w').write('\n'.join(out) + '\n')
PYEOF
        echo "📊 Shares confirmed: $SHARES (jobId: $JOB_ID)" >> "$DIR/trader.log"
      fi
    fi
  ) &
fi
