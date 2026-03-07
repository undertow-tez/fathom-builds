# model-router

3-tier model routing for Fathom: **Qwen3 (local) → Sonnet (default) → Opus (deliberate)**

Routes on task type and consequence, not complexity alone.

## Tiers

| 🏠 Qwen3:8b | ⚡ Sonnet | 🔥 Opus |
|---|---|---|
| Local, free, always-on | Claude default | Claude max |
| Heartbeats, lookups, file ops | Reasoning, conversation, coding | Trades, security, Marfa, pivots |

**Key insight:** Opus is never a fallback for Sonnet — they're on the same API. If Sonnet fails, Opus fails too. Qwen3 is the only true resilience fallback (different path entirely).

## Usage

```bash
node router.js "task description"              # → model id
node router.js --explain "task description"    # → model + reason
node router.js --json "task description"       # → full JSON
```

## See SKILL.md for full decision tree and integration guidance.
