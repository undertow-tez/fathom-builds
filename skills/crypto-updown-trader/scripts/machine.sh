#!/bin/bash
# BTC machine start/stop — cron stays permanent, this controls the flag
DIR="$(cd "$(dirname "$0")" && pwd)"

case "${1:-status}" in
  start)
    touch "$DIR/.enabled"
    echo "✅ BTC machine STARTED — next cycle at :08/:23/:38/:53"
    ;;
  stop)
    rm -f "$DIR/.enabled"
    echo "⏹️  BTC machine STOPPED"
    ;;
  status)
    if [ -f "$DIR/.enabled" ]; then
      echo "🟢 BTC machine is RUNNING"
    else
      echo "🔴 BTC machine is STOPPED"
    fi
    ;;
  *)
    echo "Usage: machine.sh [start|stop|status]"
    ;;
esac
