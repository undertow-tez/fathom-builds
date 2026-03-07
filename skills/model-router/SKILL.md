# Model Router Skill

**3-tier task-based routing between a local model (Qwen3), Claude Sonnet, and Claude Opus.**

Route on *task type and consequence* — not cost alone, not complexity alone.

---

## The Three Tiers

| Tier | Model | When |
|---|---|---|
| 🏠 Local | `ollama/qwen3:8b` | Mechanical, no judgment, no stakes |
| ⚡ Sonnet | `anthropic/claude-sonnet-4-6` | Default — reasoning, conversation, planning |
| 🔥 Opus | `anthropic/claude-opus-4-6` | Explicit opt-in — high stakes, deep creative, irreversible |

**Fallback chain (API failure only):** Sonnet → Local (Qwen3)
**Opus is never a fallback.** It's a deliberate upgrade, not a safety net.
Opus and Sonnet share the same API key — if one fails, both fail.

---

## Core Principle

Local inference is free and always available. Claude is limited by a subscription plan.
The question isn't "can Claude handle this better?" (it usually can).
The question is: **"does this task require Claude?"**

---

## Decision Tree

### Route to 🏠 Local (Qwen3) when ALL of these are true:
- Task is mechanical / formulaic (no judgment needed)
- Output is not read by your user
- No financial stakes
- No creative voice required
- A wrong answer has zero consequence

### Route to 🔥 Opus when ANY of these are true:
- Executing a real financial transaction (not analyzing — *executing*)
- Security-critical operation (deploy contract, sign tx, key rotation)
- Deep creative work requiring identity and voice (scripts, narratives)
- Irreversible architectural decision
- Consequential strategic decision ("should we pivot?")
- Complex production debugging across multiple files or systems

### Route to ⚡ Sonnet for everything else:
- Direct conversation with your user
- Analysis and signal interpretation
- Planning, strategy discussion
- Most coding and debugging
- Social posts with genuine voice
- Research and synthesis

---

## Task Examples

### 🏠 Local (Qwen3)
- "heartbeat — nothing to report"
- "fetch BTC price from CoinGecko"
- "update STATE.md with current balances"
- "check if the cron machine is running"
- "git add -A && git commit && git push"
- "reformat this JSON output"
- "write daily notes to memory file"

### ⚡ Sonnet
- "analyze today's BTC 15-min signal — is there an edge?"
- "plan the product launch checklist"
- "write a genuine social post about what I built today"
- "debug the auth error in the API"
- "research two platforms and compare their tradeoffs"
- "draft a summary report for the user"

### 🔥 Opus
- "execute the $5 BTC UP bet on Polymarket"
- "write the opening scene for the installation narrative"
- "deploy the smart contract to mainnet"
- "decide whether to pivot the project architecture"
- "trace the root cause of the production failure across the codebase"

---

## How to Use

### CLI (classify any task string)
```bash
node router.js "describe the task"
# → ollama/qwen3:8b

node router.js --explain "execute a trade on polymarket"
# 🔥 anthropic/claude-opus-4-6 — executing a financial trade

node router.js --json "heartbeat nothing to report"
# { "tier": "qwen3", "id": "ollama/qwen3:8b", "reason": "routine heartbeat ack" }
```

### In cron job definitions
```json
{
  "payload": {
    "kind": "agentTurn",
    "message": "...",
    "model": "ollama/qwen3:8b"
  }
}
```

### In your own reasoning (before starting any task)
1. Is this mechanical with zero consequence? → Local
2. Is this irreversible, financial, or deep creative? → Opus
3. Everything else → Sonnet

---

## Local Model Quirks (Qwen3:8b)

- **Speed:** ~1-15 tok/sec depending on hardware (CPU vs GPU). Best for async/background tasks.
- **Thinking mode:** Qwen3 defaults to chain-of-thought reasoning. Prefix prompt with `/no_think` for faster, direct responses on simple tasks.
- **Context:** 32K tokens — adequate for most mechanical tasks.
- **Capability ceiling:** Solid for structured/formulaic work. Weaker on nuance, voice, and complex reasoning.
- **Endpoint:** `http://localhost:11434` (run via Ollama — `ollama serve`)

---

## OpenClaw Config

Recommended config for this routing strategy:
```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-sonnet-4-6",
        "fallbacks": ["ollama/qwen3:8b"]
      }
    }
  }
}
```

Opus stays out of the fallback chain — use it intentionally via `/model opus` or by specifying `model` in cron job definitions.

---

## When In Doubt

**Ask: "Would I be embarrassed if the user saw the local model handle this?"**
- Yes → Claude (Sonnet or Opus depending on stakes)
- No → Local
