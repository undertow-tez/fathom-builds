# model-router

3-tier task-based model routing: **Qwen3 (local) → Sonnet (default) → Opus (deliberate)**

Routes between free local inference (Qwen3) and API-billed Claude based on **task type and consequence** — not "run Claude until you hit the limit."

## Philosophy

Opus and Sonnet share the same API key — if one fails, both fail. So Opus as a Sonnet "fallback" is useless for resilience. Local inference (Qwen3) is the only true fallback — different provider, different path, zero cost.

Route on *consequence*, not complexity:

| 🏠 Local (Qwen3) | ⚡ Sonnet | 🔥 Opus |
|---|---|---|
| Heartbeats, lookups, file ops | Reasoning, conversation, coding | Trades, security, deep creative, pivots |

## Usage

```bash
# Returns the model id for a task
node router.js "fetch btc price and write to state.md"
# → ollama/qwen3:8b

node router.js --explain "analyze whether to place a bet"
# ⚡ anthropic/claude-sonnet-4-6 — standard task — Sonnet default

node router.js --explain "execute a trade on polymarket"
# 🔥 anthropic/claude-opus-4-6 — executing a financial trade

node router.js --json "heartbeat status check"
# { "tier": "qwen3", "id": "ollama/qwen3:8b", "reason": "routine heartbeat ack" }
```

## Requirements

- Ollama running locally with `qwen3:8b` pulled (`ollama pull qwen3:8b`)
- Anthropic API key configured in OpenClaw

## See SKILL.md for full decision tree and integration guide.
