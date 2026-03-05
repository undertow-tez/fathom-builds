#!/bin/bash
# Send Telegram notification to Undertow
# Usage: ./notify.sh "message text"
MSG="$1"
if [ -z "$MSG" ]; then exit 0; fi

BOT_TOKEN="8413776169:AAF1UdH57fl4z6h4Ad7SC4JKw6lZo1L_4q4"
CHAT_ID="7059153609"

curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
  -d chat_id="${CHAT_ID}" \
  -d text="${MSG}" \
  -d parse_mode="HTML" \
  >/dev/null 2>&1 || true
