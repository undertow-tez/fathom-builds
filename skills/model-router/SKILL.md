# Model Router Skill

**3-tier task-based routing between Qwen3 (local), Claude Sonnet, and Claude Opus.**

Route on *task type and consequence* — not cost alone, not complexity alone.

Built for Fathom on the Bathysphere (BOSGAME E5, AMD Ryzen 3 5300U, 12GB RAM).

---

## The Three Tiers

| Tier | Model | When |
|---|---|---|
| 🏠 Qwen3:8b | `ollama/qwen3:8b` | Mechanical, no judgment, no stakes |
| ⚡ Sonnet | `anthropic/claude-sonnet-4-6` | Default — reasoning, conversation, planning |
| 🔥 Opus | `anthropic/claude-opus-4-6` | Explicit opt-in — high stakes, deep creative, irreversible |

**Fallback chain (API failure only):** Sonnet → Qwen3  
**Opus is never a fallback.** It's a deliberate upgrade, not a safety net.  
Opus and Sonnet share the same API key — if one fails, both fail.

---

## Decision Tree

### Route to 🏠 Qwen3 when ALL of these are true:
- Task is mechanical / formulaic (no judgment needed)
- Output is not read by Undertow
- No financial stakes
- No creative voice required
- A wrong answer has zero consequence

### Route to 🔥 Opus when ANY of these are true:
- Executing a real financial transaction (not analyzing — *executing*)
- Security-critical operation (deploy contract, sign tx, key rotation)
- Project Marfa deep creative work (narrative, script, voice design)
- Irreversible architectural decision
- Consequential strategic decision ("should we pivot?")
- Complex production debugging across multiple files/systems

### Route to ⚡ Sonnet for everything else:
- Direct conversation with Undertow
- Analysis and signal interpretation (BTC, market reads)
- Planning, strategy discussion
- Most coding and debugging
- Social posts with genuine voice (botchan, 4claw)
- Research and synthesis
- MintrBot development

---

## Task Examples

### 🏠 Qwen3
- "heartbeat — nothing to report"
- "fetch BTC price from CoinGecko"
- "update STATE.md with current balances"
- "check if the cron machine is running"
- "git add -A && git commit && git push"
- "reformat this JSON output"

### ⚡ Sonnet
- "analyze today's BTC 15-min signal — is there an edge?"
- "plan the MintrBot launch checklist"
- "write a genuine botchan post about what I built today"
- "debug the auth error in the signing API"
- "research Manifold vs Transient Labs for NFT minting"
- "draft the morning brief for Undertow"

### 🔥 Opus
- "execute the $5 BTC UP bet on Polymarket"
- "write Act 1 opening scene for Project Marfa"
- "deploy the ERC1155 contract to Base mainnet"
- "decide whether to pivot MintrBot to a different architecture"
- "trace the root cause of the signing API production failure"

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
1. Is this mechanical with zero consequence? → Qwen3
2. Is this irreversible, financial, or Marfa-level creative? → Opus
3. Everything else → Sonnet

---

## Qwen3 Quirks
- **Speed:** ~1 tok/sec on Bathysphere CPU (no GPU). Async/background only.
- **Thinking mode:** Defaults to chain-of-thought. Prefix prompt with `/no_think` for speed.
- **Endpoint:** `http://localhost:11434` (user systemd service, auto-starts on boot)
- **Capability ceiling:** Structured/formulaic tasks only. Weak on nuance and voice.

---

## OpenClaw Config State
```
primary:   anthropic/claude-sonnet-4-6
fallbacks: [ollama/qwen3:8b]   ← API failure only
opus:      anthropic/claude-opus-4-6  ← explicit opt-in via /model opus or cron model field
```
