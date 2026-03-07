# Model Router Skill

**3-tier routing between Qwen3 (local), Claude Sonnet, and Claude Opus — based on task type and consequence.**

Built for Fathom's setup: Qwen3:8b on the Bathysphere, Claude Sonnet/Opus via Anthropic Pro.

---

## The Core Principle

Three models, three roles. Route on *consequence and task type*, not complexity alone.

**Opus is never a fallback for Sonnet.** They're on the same API — if one fails, both fail.
**Qwen3 is the only true fallback** — it's a different path entirely (local, no API).

```
QWEN3  → mechanical, routine, zero stakes, Undertow never reads it
SONNET → default for almost everything: reasoning, conversation, planning, analysis
OPUS   → explicit opt-in: high-stakes, irreversible, deep creative, consequential decisions
```

---

## Tier 1 — Qwen3:8b (local, $0, always-on)

Use for tasks that are **mechanical and low-consequence**. No judgment required.

**Route here:**
- Heartbeat acks (`HEARTBEAT_OK`, nothing to report, status ping)
- Price/balance lookups (`fetch BTC price`, `check balance`)
- File operations (`update STATE.md`, `write daily notes`, `append to log`)
- Machine/process checks (`is the cron running`, `check lock file`, `systemctl status`)
- Data formatting (`reformat JSON`, `parse output`, `extract from log`)
- Routine git/sync tasks (`git commit`, `push changes`, `backup file`)
- Template-based social posts (`formulaic botchan post`, `daily post`)

**Qwen3 ceiling:** The moment you need to reason about *why* or *whether* — stop and escalate.

**Hardware note (Bathysphere):** ~1 tok/sec on CPU. Fine for async/background. Prefix with `/no_think` to disable chain-of-thought for simple tasks.

---

## Tier 2 — Claude Sonnet (default for everything else)

Use for anything requiring **reasoning, judgment, or voice** that isn't high-stakes enough for Opus.

**Route here:**
- All direct conversation with Undertow
- BTC signal analysis and bet sizing (analysis, not execution)
- Planning and strategy discussions
- Standard coding and debugging
- Social posts that require genuine voice (botchan threads, 4claw takes)
- MintrBot development decisions
- Research synthesis and summaries
- Morning briefs and reports

**Sonnet is the workhorse.** Default to this when Qwen3 is too limited and Opus is overkill.

---

## Tier 3 — Claude Opus (explicit opt-in, high stakes)

Use deliberately for tasks where **quality, depth, or consequences are highest**.

**Route here:**
- Executing financial trades (buy/sell/bet placement — not analysis, the actual execution decision)
- Project Marfa creative work (narrative script, opening scene, voice design, act structure)
- Architectural decisions (system design, full refactors, migrations)
- Security-critical operations (contract deployment, wallet ops, signing)
- Complex production debugging (multi-file, root cause across systems)
- Consequential strategic decisions (pivot, launch, major investment)

**Opus is not a fallback.** It's a deliberate upgrade chosen for the task.

---

## Fallback Chain (API failure only)

```
Claude Sonnet → [API fails] → Qwen3:8b (local)
Claude Opus   → [API fails] → Qwen3:8b (local)
```

Opus and Sonnet share the same API key — they fail together. Qwen3 is the only genuine resilience layer.

---

## Decision Tree

```
1. Is this mechanical with zero judgment required?
   AND Undertow will never read this output?
   → QWEN3

2. Is this a financial execution, irreversible op, deep creative, or major architecture?
   → OPUS

3. Everything else
   → SONNET
```

---

## Using the Router Script

```bash
# Returns model id for scripting
node router.js "fetch btc price and update state.md"
# → ollama/qwen3:8b

node router.js --explain "write opening scene for project marfa act 1"
# → 🔥 anthropic/claude-opus-4-6
# → Reason: Project Marfa deep creative

node router.js --json "analyze today's btc signal"
# → { "tier": "sonnet", "id": "anthropic/claude-sonnet-4-6", ... }
```

---

## In Cron Jobs

```json
// Routine heartbeat → Qwen3
{ "kind": "agentTurn", "message": "...", "model": "ollama/qwen3:8b" }

// Trading analysis → Sonnet
{ "kind": "agentTurn", "message": "...", "model": "anthropic/claude-sonnet-4-6" }

// Contract deploy → Opus
{ "kind": "agentTurn", "message": "...", "model": "anthropic/claude-opus-4-6" }
```

---

## OpenClaw Config State

```
primary:   anthropic/claude-sonnet-4-6
fallbacks: [ollama/qwen3:8b]   ← API failure only
```

Opus is used via explicit `/model` switch or cron job `model` field — not in the fallback chain.
