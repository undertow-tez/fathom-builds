#!/bin/bash
# Poll a Bankr job until complete, print the result text
# Usage: poll-job.sh <job_id> [max_wait_seconds]
# Exit 0 on success, 1 on timeout/error
# Prints job result text to stdout on success

set -euo pipefail

JOB_ID="${1:-}"
MAX_WAIT="${2:-180}"  # default 3 min timeout
INTERVAL=10

if [ -z "$JOB_ID" ]; then
  echo "Usage: poll-job.sh <job_id> [max_wait_seconds]" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATUS_SCRIPT="$SCRIPT_DIR/../skills/bankr/scripts/bankr-status.sh"

if [ ! -f "$STATUS_SCRIPT" ]; then
  echo "bankr-status.sh not found at $STATUS_SCRIPT" >&2
  exit 1
fi

ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
  RESPONSE=$(bash "$STATUS_SCRIPT" "$JOB_ID" 2>/dev/null || echo '{}')
  STATUS=$(echo "$RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
  
  if [ "$STATUS" = "completed" ]; then
    # Extract result/output text
    RESULT=$(echo "$RESPONSE" | python3 -c "
import json, sys
d = json.load(sys.stdin)
# Try various fields where Bankr might put the output
for key in ['result', 'output', 'response', 'text', 'message']:
    v = d.get(key, '')
    if v:
        print(v)
        sys.exit(0)
# Fallback: print whole thing
print(json.dumps(d))
" 2>/dev/null || echo "$RESPONSE")
    echo "$RESULT"
    exit 0
  fi

  if [ "$STATUS" = "failed" ] || [ "$STATUS" = "error" ]; then
    echo "Job $JOB_ID failed" >&2
    exit 1
  fi

  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
done

echo "Timeout waiting for job $JOB_ID after ${MAX_WAIT}s" >&2
exit 1
