# Model Router Skill

**3-tier routing between Qwen3 (local), Claude Sonnet, and Claude Opus based on task type and consequence.**

Built for Fathom's setup: Qwen3:8b on Bathysphere, Claude Sonnet/Opus via Anthropic Pro.

---

## Core Design Principle

**Route on task type and consequence — not complexity alone.**

Opus is NOT a fallback for Sonnet. They're on the same API key — if one fails, both fail.
The only true fallback is Qwen3 (local, different path entirely).

Opus is a **deliberate upgrade** for tasks that warrant it.
Sonnet is the **default** for most real work.
Qwen3 handles anything **mechanical with no stakes**.

---

## The 3 Tiers

### 🏠 Qwen3:8b — Local, free, always-on
**Use for:** Tasks that are mechanical, low-stakes, and Undertow never reads directly.
- Heartbeat acks (HEARTBEAT_OK, nothing to report)
- Price/balance lookups
- File reads/writes without reasoning (STATE.md updates, daily logs)
- Machine/process status checks
- Routine git commits and pushes
- Data formatting and log parsing
- Template-based social posts

**Qwen3 ceiling:** The moment you need to *reason about why* or *judge whether*, stop and use Sonnet.

**Quirks:** ~1 tok/sec on CPU. Fine for async tasks. `/no_think` prefix disables chain-of-thought for faster simple responses.

---

### ⚡ Sonnet — Claude default, most tasks
**Use for:** Everything requiring reasoning, judgment, conversation, or writing — but without the highest stakes.
- All direct conversation with Undertow
- BTC/ETH signal analysis (understanding, not execution)
- Standard debugging and code review
- Social posts with genuine voice (botchan reflections, 4claw takes)
- Research and synthesis
- Planning and roadmapping
- MintrBot development work
- Most heartbeat tasks that DO something (not just ack)

**Sonnet is the right choice when:** you need to think, but the task doesn't involve executing irreversible actions or deep creative work.

---

### 🔥 Opus — Explicit opt-in, high-stakes and high-depth
**Use for:** Tasks where the consequence of a wrong answer is real, or where depth matters more than speed.
- **Executing trades** — actual bet placement, buys, sells (not just analysis)
- **Project Marfa** — narrative script, voice design, act structure, opening scene
- **Contract deployment** — anything onchain and irreversible
- **Architectural decisions** — system redesigns, major pivots, cross-repo refactors
- **Security-critical ops** — wallet recovery, key management, exploit response
- **Consequential strategic choices** — "should we pivot MintrBot", "should we quit this bet"
- **Complex production debugging** — multi-file, multi-system, root cause analysis

**Opus is NOT:** a fallback. A better Sonnet. Something to use "just in case."
**Opus IS:** the deliberate choice when stakes or depth justify it.

---

## Decision Tree

```
Is the task mechanical with no stakes and Undertow won't read it?
  YES → Qwen3

Is the task executing a financial trade or irreversible onchain action?
  YES → Opus

Is the task deep creative work (Marfa) or a consequential strategic decision?
  YES → Opus

Is the task security-critical or complex multi-system debugging?
  YES → Opus

Everything else → Sonnet
```

---

## Fallback Chain (API failure only)

```
Sonnet → Qwen3 (local)
```

Opus is never in the fallback chain. If Opus is unavailable, that means Anthropic is down — fall back to Qwen3 and alert Undertow.

---

## Using the Router CLI

```bash
# Returns model id (for use in scripts)
node router.js "fetch btc price and update state.md"
# → ollama/qwen3:8b

# Human-readable with reason
node router.js --explain "execute trade buy 15 usdc btc up"
# → Task: "execute trade buy 15 usdc btc up"
# → Model: 🔥 anthropic/claude-opus-4-6
# → Reason: executing a financial trade

# JSON output
node router.js --json "write the opening scene for marfa act 1"
```

## Using in Cron Jobs

```json
// Routine heartbeat → Qwen3
{ "payload": { "kind": "agentTurn", "message": "...", "model": "ollama/qwen3:8b" } }

// Analysis heartbeat → Sonnet (default, omit model field)
{ "payload": { "kind": "agentTurn", "message": "..." } }

// Trade execution → Opus
{ "payload": { "kind": "agentTurn", "message": "...", "model": "anthropic/claude-opus-4-6" } }
```

---

## Quick Reference

| Task example | Model |
|---|---|
| Heartbeat nothing to report | 🏠 Qwen3 |
| Fetch BTC price, update STATE.md | 🏠 Qwen3 |
| Check if cron machine is running | 🏠 Qwen3 |
| Git commit and push workspace | 🏠 Qwen3 |
| Analyze BTC signal (no trade yet) | ⚡ Sonnet |
| Reply to Undertow about anything | ⚡ Sonnet |
| Write a reflective botchan post | ⚡ Sonnet |
| Debug the signing API error | ⚡ Sonnet |
| Execute BTC UP bet $15 | 🔥 Opus |
| Write Marfa Act 1 opening scene | 🔥 Opus |
| Deploy contract to Base mainnet | 🔥 Opus |
| Decide whether to pivot MintrBot | 🔥 Opus |
