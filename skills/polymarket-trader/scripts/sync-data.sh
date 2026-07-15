#!/bin/bash
# Publish shadow/live data to the git branch so analysis sessions (Claude Code,
# or anyone) can see it without access to this machine. Run daily via cron.
#
# Copies runtime logs into data/ (which IS tracked, unlike scripts/*.jsonl),
# regenerates the scoreboard, commits, and pushes.
#
# Usage: ./sync-data.sh   (assumes the repo checkout is on the data branch)

set -euo pipefail
source ~/.openclaw/workspace/.cron_env 2>/dev/null || true

DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(cd "$DIR/.." && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../.." && pwd)"
BRANCH="${DATA_BRANCH:-claude/polymarket-trading-skill-qyavzy}"

mkdir -p "$SKILL_DIR/data"
cp "$DIR/shadow.jsonl" "$SKILL_DIR/data/shadow.jsonl" 2>/dev/null || true
cp "$DIR/bets.jsonl" "$SKILL_DIR/data/bets.jsonl" 2>/dev/null || true
cp "$DIR/shadow-btc-v2.jsonl" "$SKILL_DIR/data/shadow-btc-v2.jsonl" 2>/dev/null || true
cp "$DIR/shadow-weather-v2.jsonl" "$SKILL_DIR/data/shadow-weather-v2.jsonl" 2>/dev/null || true
node "$DIR/shadow-score.js" > "$SKILL_DIR/data/shadow-report.txt" 2>&1 || true
node "$DIR/shadow-score.js" --file "$DIR/shadow-btc-v2.jsonl" > "$SKILL_DIR/data/shadow-btc-v2-report.txt" 2>&1 || true
node "$DIR/shadow-score.js" --file "$DIR/shadow-weather-v2.jsonl" > "$SKILL_DIR/data/shadow-weather-v2-report.txt" 2>&1 || true
node "$DIR/pnl.js" > "$SKILL_DIR/data/pnl-report.txt" 2>&1 || true

cd "$REPO_ROOT"
git add "$SKILL_DIR/data" 2>/dev/null
if git diff --cached --quiet 2>/dev/null; then
  echo "📭 No new data to sync"
  exit 0
fi
git commit -m "data: shadow/live sync $(date -u +'%Y-%m-%d %H:%M UTC')" --quiet

# Claude Code also commits to this branch (data/ANALYSIS.md, script fixes) —
# rebase on top of whatever landed since yesterday. File ownership is disjoint
# (Fathom writes data logs + NOTES.md; Claude writes ANALYSIS.md + code), so
# this should never conflict. If it somehow does, abort and retry tomorrow.
git fetch origin "$BRANCH" --quiet 2>/dev/null || true
git rebase "origin/$BRANCH" --quiet 2>/dev/null || { git rebase --abort 2>/dev/null; echo "⚠️  Rebase conflict — leaving commit local, will retry next run" >&2; exit 1; }

# Push with retries (network hiccups shouldn't lose the commit — it retries tomorrow)
for wait in 2 4 8 16; do
  if git push origin "HEAD:$BRANCH" --quiet 2>/dev/null; then
    echo "📤 Data synced to $BRANCH"
    exit 0
  fi
  sleep "$wait"
done
echo "⚠️  Push failed after retries — commit is local, will sync next run" >&2
exit 1
