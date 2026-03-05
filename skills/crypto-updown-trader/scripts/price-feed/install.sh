#!/bin/bash
# Install price-feed as a systemd service on Bathysphere
# Usage: bash install.sh [btc,eth,sol,xrp]
# Default: btc only

set -euo pipefail

ASSETS="${1:-btc}"
FEED_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_NAME="btc-price-feed"
NODE_BIN=$(which node)
USER=$(whoami)

echo "🌊 Installing price feed service..."
echo "   Assets: $ASSETS"
echo "   Feed dir: $FEED_DIR"
echo "   Node: $NODE_BIN"
echo "   User: $USER"

# Create systemd service file
sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null << EOF
[Unit]
Description=Fathom BTC/Crypto Price Feed (WebSocket → local cache)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${USER}
WorkingDirectory=${FEED_DIR}
ExecStart=${NODE_BIN} ${FEED_DIR}/feed.js ${ASSETS}
Restart=always
RestartSec=10
Environment=ASSETS=${ASSETS}
StandardOutput=append:/tmp/price-feed.log
StandardError=append:/tmp/price-feed.log

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}
sudo systemctl restart ${SERVICE_NAME}

sleep 3
STATUS=$(sudo systemctl is-active ${SERVICE_NAME} 2>/dev/null || echo "unknown")
echo ""
if [ "$STATUS" = "active" ]; then
  echo "✅ Price feed service is running"
  echo "   Logs: tail -f /tmp/price-feed.log"
  echo "   Status: systemctl status ${SERVICE_NAME}"
  echo "   Cache: ${FEED_DIR}/candles-*.json"
else
  echo "⚠️  Service status: $STATUS"
  echo "   Check logs: tail -20 /tmp/price-feed.log"
fi
