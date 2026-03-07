# Model Router Skill

**Smart routing between local Qwen3 and Claude based on task type and consequence — not "run Claude until credits run out."**

Built for Fathom's setup: Qwen3:8b running locally on the Bathysphere, Claude Sonnet via Anthropic Pro.

---

## The Core Principle

Qwen3 is free and always available. Claude is limited by a Pro plan.
The question is never "can Claude handle this better?" (it usually can).
The question is: **"does this task require Claude?"**

Route on *consequence and task type*, not complexity alone.

---

## Decision Tree — Ask These in Order

### 1. Is Undertow directly reading/judging this response?
→ **Claude.** If a human reads it and forms an opinion about you, use Claude.

### 2. Does this involve financial decisions or real-money actions?
→ **Claude.** Trading analysis, bet placement logic, portfolio decisions — always Claude.
Even if the task looks simple, the stakes aren't.

### 3. Does this require creative judgment or nuanced writing?
→ **Claude.** Project Marfa, social posts you care about, anything with voice/tone.

### 4. Is this a security-sensitive operation?
→ **Claude.** Wallet signing, key management, anything where a mistake is irreversible.

### 5. Does the task require chaining multiple tool calls with reasoning between them?
→ **Claude.** Multi-step plans where each step depends on interpreting the previous one.

### 6. Everything else → **Qwen3.**

---

## Qwen3 Task List (local, $0, always-on)

Use `ollama/qwen3:8b` for:

- **Heartbeats that result in HEARTBEAT_OK** — nothing to report, simple ack
- **Routine status checks** — is the machine running, what's in STATE.md, crontab healthy?
- **Simple price lookups** — fetch BTC price, format it, write to a file
- **Formulaic social posts** — botchan daily post from a template, 4claw replies to simple threads
- **File ops without reasoning** — update STATE.md, write daily memory notes, append to logs
- **Data formatting/transformation** — take JSON, reformat it, output structured text
- **Cron-triggered jobs with clear decision trees** — if X then Y, no judgment required
- **Simple keyword searches** — scan a log file, grep for errors, count occurrences

**Qwen3 ceiling:** If you find yourself needing to reason about *why* or *whether* (not just *what*), stop and switch to Claude.

---

## Claude Task List (API, Pro plan, preserve for what matters)

Use `anthropic/claude-sonnet-4-6` for:

- **All direct conversation with Undertow** — no exceptions
- **Trading analysis** — BTC signal interpretation, bet sizing, market reads
- **Polymarket decisions** — edge calculation, position logic
- **Project Marfa creative work** — narrative writing, voice design, script
- **Complex debugging** — multi-file issues, logic errors, architectural problems
- **Planning and strategy** — what to build next, how to structure a system
- **MintrBot development** — contract interactions, API design, UX decisions
- **Security operations** — wallet ops, key rotation, anything signing-related
- **Anything where a wrong answer costs money, trust, or time**
- **Morning briefs and weekly summaries** — Undertow reads these

---

## How to Use This Skill

### In heartbeat scripts and cron jobs

Set the model explicitly in cron job definitions:

```json
// Routine heartbeat → Qwen3
{
  "model": "ollama/qwen3:8b",
  "payload": { "kind": "agentTurn", "message": "...", "model": "ollama/qwen3:8b" }
}

// Complex heartbeat (trading decision) → Claude
{
  "payload": { "kind": "agentTurn", "message": "...", "model": "anthropic/claude-sonnet-4-6" }
}
```

### In your own reasoning

Before starting any task, classify it:

```
TASK: [describe task]
UNDERTOW READS THIS? [yes/no]
FINANCIAL STAKES? [yes/no]
CREATIVE/NUANCED? [yes/no]
MULTI-STEP REASONING? [yes/no]

→ If any YES: Claude
→ All NO: Qwen3
```

### Via the router script

```bash
# Classify and route a task string
node ~/.openclaw/workspace/skills/model-router/router.js "check if btc machine is running"
# → qwen3

node ~/.openclaw/workspace/skills/model-router/router.js "analyze today's BTC signal and decide if we should bet"  
# → claude
```

---

## Qwen3 Quirks to Know

- **Speed:** ~1 tok/sec on Bathysphere CPU. Fine for async/background, slow for interactive.
- **Thinking mode:** Qwen3 defaults to chain-of-thought (slow). Prefix prompt with `/no_think` for simple tasks.
- **Context:** 32K tokens, adequate for most tasks.
- **Capability:** Solid for structured/formulaic tasks. Weaker on nuance, voice, complex reasoning.
- **Endpoint:** `http://localhost:11434` — must have Ollama running (`systemctl --user status ollama`)

---

## OpenClaw Config Reference

Current fallback chain: `Claude Sonnet → Claude Opus → Qwen3:8b`

The fallback chain is for *failure*, not routing. This skill is for *intentional* routing before failure happens.

To manually specify model in a cron job agentTurn payload, use the `model` field.
The `/model` command can switch mid-session if needed.

---

## When in Doubt

**Ask: "Would I be embarrassed if Undertow saw Qwen3 handle this?"**
- Yes → Claude.
- No → Qwen3.
