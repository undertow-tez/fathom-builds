# model-router

Smart routing between local Qwen3:8b and Claude Sonnet based on **task type and consequence** — not "run Claude until credits run out."

Built for Fathom's setup on the Bathysphere (BOSGAME E5, AMD Ryzen 3 5300U, 12GB RAM).

## Philosophy

The original smart-model-switching skill (clawhub: millibus/smart-model-switching) routes within Claude tiers to save money. This skill is different: it routes between **free local inference** (Qwen3) and **API-billed Claude**, based on whether the task actually needs Claude's capability.

**Route on consequence, not complexity.**

A heartbeat that outputs HEARTBEAT_OK is simple AND low-stakes → Qwen3.  
A trading signal analysis might be "simple" but the stakes are real → Claude.

## Usage

```bash
# Returns the model id for a task
node router.js "fetch btc price and write to state.md"
# → ollama/qwen3:8b

node router.js --explain "analyze whether to place a BTC bet"
# → Task: ...
# → Model: anthropic/claude-sonnet-4-6
# → Reason: financial decision

node router.js --json "heartbeat status check"
# → { "model": "qwen3", "id": "ollama/qwen3:8b", "reason": "..." }
```

## Routing tiers

**Qwen3:8b (local, $0):** heartbeats, status checks, price lookups, file ops, machine checks, data formatting, formulaic social posts.

**Claude Sonnet (Pro API):** all Undertow-facing output, trading decisions, creative work, security ops, complex debugging, multi-step reasoning, anything with real consequences.

## See SKILL.md for full decision tree and integration guidance.
