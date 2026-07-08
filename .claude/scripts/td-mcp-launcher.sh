#!/usr/bin/env bash
# Launcher for the bottobot TouchDesigner docs MCP server (td-mcp).
# Installs it from GitHub on first use (the npm tarball @bottobot/td-mcp
# is missing files, so we must install from the repo), then execs it.
# All install output goes to stderr so stdout stays clean for MCP JSON-RPC.
set -euo pipefail

if ! command -v td-mcp >/dev/null 2>&1; then
  echo "[td-mcp-launcher] td-mcp not found; installing from GitHub..." >&2
  npm install -g github:bottobot/touchdesigner-mcp-server >&2
fi

exec td-mcp
