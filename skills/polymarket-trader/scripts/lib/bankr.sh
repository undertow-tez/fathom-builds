#!/bin/bash
# Bankr access library — shared by all polymarket-trader scripts.
#
# Resolution order for talking to Bankr:
#   1. A local bankr skill's scripts (bankr-submit.sh / bankr-status.sh), if installed
#   2. Bankr REST API directly, using an API key from:
#        a. $BANKR_API_KEY env var
#        b. .apiKey in a bankr skill config.json (several known locations)
#
# Functions:
#   bankr_submit "<natural language prompt>"   → prints raw JSON response ({"jobId": ...})
#   bankr_job_status <jobId>                   → prints raw JSON status response
#   bankr_poll <jobId> [max_wait_seconds]      → polls until completed, prints result text
#
# All functions return non-zero on hard failure. Callers should treat Bankr as
# fire-and-forget: submit, capture jobId, verify later. Never resubmit on timeout —
# a killed poll does NOT mean a killed job (Bankr keeps executing server-side).

BANKR_API_URL="${BANKR_API_URL:-https://api.bankr.bot}"

_bankr_lib_dir() { cd "$(dirname "${BASH_SOURCE[0]}")" && pwd; }

# Find a script from an installed bankr skill (submit/status), if any
_bankr_skill_script() {
  local name="$1"  # bankr-submit.sh | bankr-status.sh
  local base
  for base in \
    "$(_bankr_lib_dir)/../../../bankr" \
    "$HOME/.openclaw/skills/bankr" \
    "$HOME/.openclaw/workspace/skills/bankr" \
    "$HOME/.clawdbot/skills/bankr"; do
    if [ -f "$base/scripts/$name" ]; then
      echo "$base/scripts/$name"
      return 0
    fi
  done
  return 1
}

_bankr_api_key() {
  if [ -n "${BANKR_API_KEY:-}" ]; then
    echo "$BANKR_API_KEY"
    return 0
  fi
  local cfg
  for cfg in \
    "$(_bankr_lib_dir)/../../../bankr/config.json" \
    "$HOME/.openclaw/skills/bankr/config.json" \
    "$HOME/.openclaw/workspace/skills/bankr/config.json" \
    "$HOME/.clawdbot/skills/bankr/config.json"; do
    if [ -f "$cfg" ]; then
      jq -r '.apiKey // empty' "$cfg" 2>/dev/null && return 0
    fi
  done
  return 1
}

# Submit a prompt to Bankr. Prints the raw JSON response (contains jobId).
bankr_submit() {
  local prompt="$1"
  local script
  if script=$(_bankr_skill_script "bankr-submit.sh"); then
    bash "$script" "$prompt"
    return $?
  fi
  local key
  key=$(_bankr_api_key) || { echo '{"error":"No Bankr API key. Set BANKR_API_KEY or install the bankr skill."}'; return 1; }
  curl -sf --max-time 20 -X POST "$BANKR_API_URL/agent/prompt" \
    -H "X-API-Key: $key" -H "Content-Type: application/json" \
    -d "$(jq -nc --arg p "$prompt" '{prompt: $p}')"
}

# Get raw status JSON for a job
bankr_job_status() {
  local job_id="$1"
  local script
  if script=$(_bankr_skill_script "bankr-status.sh"); then
    bash "$script" "$job_id"
    return $?
  fi
  local key
  key=$(_bankr_api_key) || { echo '{}'; return 1; }
  curl -sf --max-time 15 "$BANKR_API_URL/agent/job/$job_id" -H "X-API-Key: $key"
}

# Poll a job until completion. Prints the job's result text on success.
bankr_poll() {
  local job_id="$1"
  local max_wait="${2:-180}"
  local interval=10
  local elapsed=0
  while [ "$elapsed" -lt "$max_wait" ]; do
    local response status
    response=$(bankr_job_status "$job_id" 2>/dev/null || echo '{}')
    status=$(echo "$response" | jq -r '.status // empty' 2>/dev/null || echo "")
    if [ "$status" = "completed" ]; then
      echo "$response" | jq -r '.result // .output // .response // .text // .message // (. | tostring)' 2>/dev/null || echo "$response"
      return 0
    fi
    if [ "$status" = "failed" ] || [ "$status" = "error" ]; then
      echo "Job $job_id failed" >&2
      return 1
    fi
    sleep "$interval"
    elapsed=$((elapsed + interval))
  done
  echo "Timeout waiting for job $job_id after ${max_wait}s" >&2
  return 1
}
