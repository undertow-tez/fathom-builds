# Model Router Skill

**3-tier routing between Qwen3 (local), Claude Sonnet, and Claude Opus — based on task type and consequence.**

Built for Fathom's setup: Qwen3:8b running locally on the Bathysphere, Claude via Anthropic Pro.

---

## The Core Principle

Route on **task type and consequence**, not complexity alone.

- **Opus is not a fallback for Sonnet** — they're on the same API. If the API fails, both fail. Opus is a deliberate *upgrade* for tasks that warrant it.
- **Qwen3 is the only true fallback** — different path entirely (local, no API dependency).
- **Sonnet is the default** — handles the majority of reasoning, conversation, and planning.

---

## The Three Tiers

### 🏠 Qwen3:8b — Local, Free, Mechanical
Use when the task is routine, formulaic, and **no one is reading the output critically.**

- Heartbeat acks (HEARTBEAT_OK)
- Price lookups, balance checks
- File ops — update STATE.md, write daily notes, append logs
- Machine/process status checks
- Formulaic social posts (template-based)
- Data formatting, parsing, grep/extract
- Routine cron tasks — git push, workspace sync

**Qwen3 ceiling:** The moment you need to *reason about why*, *decide whether*, or *write something Undertow will read* — stop, go up.

### ⚡ Sonnet — Default, Most Tasks
Use for everything that needs real reasoning but isn't high-stakes enough for Opus.

- All direct conversation with Undertow
- BTC/ETH signal analysis (interpreting data, not placing bets)
- General coding, debugging single files
- Planning, research, synthesis
- Social posts with actual voice/judgment
- Most MintrBot development
- Anything you're unsure about — Sonnet is the safe default

### 🔥 Opus — Explicit Upgrade, High Stakes
Use deliberately when the task is irreversible, deeply creative, or consequential.

- **Executing trades/bets** — money is moving
- **Project Marfa creative work** — narrative, script, voice design, act structure
- **Architectural decisions** — system design, migrations, overhauls
- **Security-critical ops** — contract deployment, wallet operations
- **Strategic pivots** — "should we quit X and do Y instead"
- **Complex production debugging** — multi-file, multi-repo, traced failures

**Opus is not a fallback. It's a choice.**

---

## Fallback Chain (API failure only)

```
Sonnet → Qwen3 (automatic, if Anthropic API fails)
```

Opus does NOT appear in the fallback chain. If Sonnet fails, Opus would too.

---

## Decision Tree

```
Is this mechanical/formulaic with no judgment required?
  → QWEN3

Is this irreversible, high-stakes, deeply creative, or strategic?
  → OPUS

Everything else:
  → SONNET
```

One more check before Sonnet vs Opus:
> "Would a wrong answer here cost money, trust, or be hard to undo?"
> Yes → Opus. No → Sonnet.

---

## Using the Router Script

```bash
# Returns model id (for use in scripts/cron)
node router.js "fetch btc price and write to state.md"
# → ollama/qwen3:8b

# Human-readable explanation
node router.js --explain "place a bet on polymarket btc up"
# 🔥 anthropic/claude-opus-4-6 — executing a financial trade

# JSON output (for programmatic use)
node router.js --json "analyze the signal and tell me what you think"
# → { "tier": "sonnet", "id": "anthropic/claude-sonnet-4-6", ... }
```

---

## In Cron Jobs

Tag the model explicitly in the cron `payload`:

```json
{ "kind": "agentTurn", "message": "...", "model": "ollama/qwen3:8b" }    // routine
{ "kind": "agentTurn", "message": "...", "model": "anthropic/claude-sonnet-4-6" }  // normal
{ "kind": "agentTurn", "message": "...", "model": "anthropic/claude-opus-4-6" }    // high-stakes
```

---

## Qwen3 Quirks

- **Speed:** ~1 tok/sec on Bathysphere CPU. Fine for async/background.
- **Thinking mode:** Defaults to chain-of-thought. Prefix with `/no_think` for simple tasks.
- **Endpoint:** `http://localhost:11434` — runs as user systemd service (`systemctl --user status ollama`)
- **Context:** 32K tokens

---

## OpenClaw Config (current)

```
primary:  anthropic/claude-sonnet-4-6
fallback: ollama/qwen3:8b  (API failure only)
opus:     explicit opt-in via /model or cron model field
```
