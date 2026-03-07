# Model Router Skill

**3-tier model routing based on task type and consequence.**

Built for Fathom's setup: Qwen3:8b local on Bathysphere, Claude Sonnet + Opus via Anthropic Pro.

---

## The Three Tiers

| Tier | Model | When |
|---|---|---|
| 🏠 Qwen3 | `ollama/qwen3:8b` | Mechanical, no stakes, no judgment |
| ⚡ Sonnet | `anthropic/claude-sonnet-4-6` | Default — reasoning, conversation, planning |
| 🔥 Opus | `anthropic/claude-opus-4-6` | Explicit opt-in — high-stakes, complex, irreversible |

**Fallback chain (API failure only):** Sonnet → Qwen3  
**Opus is never a fallback.** It's a deliberate upgrade, not a safety net.

---

## Core Principle

Route on **consequence and task type**, not just complexity.

A trading execution might look "simple" (one API call) but the stakes are real → Opus.  
A 500-word botchan post requires more tokens than a heartbeat ack but has no consequences → Sonnet.  
A heartbeat that outputs HEARTBEAT_OK → Qwen3. Don't hire a surgeon to wave at you.

---

## Decision Tree

### Use 🏠 Qwen3 when ALL are true:
- Undertow won't read/judge this output
- No financial stakes
- No creative judgment needed
- Mechanical: fetch, check, format, write, ack

**Qwen3 task list:**
- Heartbeat acks (HEARTBEAT_OK)
- Price lookups and balance checks
- Updating STATE.md, memory files, logs
- Machine/process status checks (is cron running?)
- Data formatting and log parsing
- Routine git commits and file ops
- Formulaic social posts from a template

**Qwen3 ceiling:** If you're reasoning about *why* or *whether* (not just *what*) — stop, use Sonnet.

---

### Use ⚡ Sonnet (default) for everything in between:
- Direct conversations with Undertow
- BTC/ETH signal analysis (interpretation, not execution)
- Standard coding and debugging
- Planning and research
- Social posts requiring voice and judgment
- Portfolio reviews and summaries
- MintrBot development
- Most multi-step tasks

---

### Use 🔥 Opus when the task is:
- **Executing a real money trade** — Polymarket bets, swaps, transfers
- **Security-critical** — contract deployment, wallet ops, key management
- **Architecturally consequential** — system redesign, migration, full refactor
- **Deep Project Marfa creative** — narrative script, voice design, act structure
- **Genuinely hard to reverse** — if a mistake costs money, trust, or weeks of work
- **Strategic with real consequences** — pivot decisions, launch decisions, investment calls

**Opus rule:** Would you want the best possible reasoning here, or just good reasoning?  
If "best possible" matters — use Opus.

---

## How to Use

### Quick classification
```bash
node router.js "describe the task"
# → ollama/qwen3:8b

node router.js --explain "place a bet on BTC up"
# → 🔥 anthropic/claude-opus-4-6
# → Reason: executing a financial trade

node router.js --json "heartbeat status check"
# → { "tier": "qwen3", "id": "ollama/qwen3:8b", "reason": "..." }
```

### In cron job agentTurn payloads
```json
{ "kind": "agentTurn", "message": "...", "model": "ollama/qwen3:8b" }
{ "kind": "agentTurn", "message": "...", "model": "anthropic/claude-sonnet-4-6" }
{ "kind": "agentTurn", "message": "...", "model": "anthropic/claude-opus-4-6" }
```

### Mental check before any task
```
1. Mechanical with no stakes? → Qwen3
2. High-stakes or irreversible? → Opus
3. Everything else → Sonnet
```

---

## Qwen3 Quirks

- **Speed:** ~1 tok/sec on Bathysphere CPU (no GPU). Fine for background/async.
- **Thinking mode:** Qwen3 defaults to chain-of-thought. Prefix with `/no_think` for simple tasks.
- **Endpoint:** `http://localhost:11434` (must have Ollama running — user systemd service, auto-starts)
- **Capability:** Good at structured/formulaic tasks. Weak on nuance, voice, complex reasoning.

---

## OpenClaw Config State

```
primary:   anthropic/claude-sonnet-4-6
fallbacks: [ollama/qwen3:8b]   ← API failure only
```

Opus is available via alias `opus` or full id `anthropic/claude-opus-4-6`.  
Use it intentionally — never as a fallback.
