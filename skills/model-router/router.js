#!/usr/bin/env node
/**
 * model-router.js — 3-tier task-based model routing for AI agents
 *
 * Tiers:
 *   QWEN3   — local, free, always-on. Routine/mechanical tasks.
 *   SONNET  — Claude default. Most reasoning, conversation, planning.
 *   OPUS    — Claude max. Explicit opt-in for high-stakes complex work.
 *
 * Fallback chain (API failure only): Sonnet → Qwen3
 * Opus is never a fallback — it's a deliberate upgrade.
 *
 * Usage:
 *   node router.js "describe the task"
 *   node router.js --explain "describe the task"
 *   node router.js --json "describe the task"
 */

const args = process.argv.slice(2);
const flags = args.filter(a => a.startsWith('--'));
const task = args.filter(a => !a.startsWith('--')).join(' ').toLowerCase();
const jsonMode = flags.includes('--json');
const explainMode = flags.includes('--explain');

if (!task) {
  console.error('Usage: node router.js [--json] [--explain] "task description"');
  process.exit(1);
}

// ─── TIER DEFINITIONS ────────────────────────────────────────────────────────

/**
 * OPUS — High-stakes, high-complexity, irreversible, or deep creative.
 * Use deliberately. More capable than Sonnet but same API (not a fallback).
 */
const OPUS_SIGNALS = [
  // Financial decisions with real money moving
  { pattern: /\b(place.*bet|execute.*trade|buy.*usdc|sell.*eth|send.*usdc|transfer.*funds|leverage.*position|polymarket.*execute)\b/, reason: 'executing a financial trade' },
  // Architecture / irreversible decisions
  { pattern: /\b(architect|system design|refactor.*entire|migrate|overhaul|redesign)\b/, reason: 'architectural decision' },
  // Deep creative requiring voice/identity
  { pattern: /\b(opening scene|narrative script|act \d|five.act|installation script|voice design|creative script|story script)\b/, reason: 'deep creative requiring voice/identity' },
  // Security critical
  { pattern: /\b(deploy contract|sign.*transaction|private key|wallet recovery|emergency|drainer|exploit)\b/, reason: 'security-critical operation' },
  // Complex multi-file debugging
  { pattern: /\b(multi.file|across.*repo|root cause.*production|critical.*bug|debugg.*contract|trace.*failure)\b/, reason: 'complex production debugging' },
  // Strategic planning with consequences
  { pattern: /\b(strategy for|long.term plan|decide whether to|should (i|we) (pivot|quit|launch|invest))\b/, reason: 'consequential strategic decision' },
];

/**
 * QWEN3 — Local, free, mechanical. No judgment, no stakes, not user-facing.
 */
const QWEN_SIGNALS = [
  // Heartbeat ack
  { pattern: /\b(heartbeat|heartbeat_ok|nothing to report|ack|all clear|status ping)\b/, reason: 'routine heartbeat ack' },
  // Price / data fetch
  { pattern: /\b(fetch price|get price|btc price|eth price|coingecko|price check|check balance)\b/, reason: 'data lookup' },
  // File ops (mechanical)
  { pattern: /\b(update state\.md|write.*log|append.*log|update.*memory|daily notes|write.*file|read.*file)\b/, reason: 'mechanical file operation' },
  // Machine / process status
  { pattern: /\b(is.*running|machine running|cron.*status|check.*cron|lock file|process.*running|systemctl status|service.*status)\b/, reason: 'machine/process status check' },
  // Formulaic social (template-based)
  { pattern: /\b(routine.*post|daily.*template.*post|template.*post|formulaic.*post)\b/, reason: 'formulaic/template social post' },
  // Data formatting / transformation (no reasoning)
  { pattern: /\b(reformat|convert.*json|parse.*output|extract.*from log|count.*lines|grep|sort.*output)\b/, reason: 'data formatting/transformation' },
  // Simple cron tasks
  { pattern: /\b(git (add|commit|push)|sync.*workspace|push.*changes|backup.*file)\b/, reason: 'routine cron/git task' },
];

/**
 * SONNET — Default for everything else. Reasoning, conversation, planning,
 * analysis, most coding, most social, most decision support.
 */

// ─── CLASSIFIER ──────────────────────────────────────────────────────────────

function classify(taskStr) {
  // Check Qwen first — clearly mechanical tasks shouldn't escalate
  for (const { pattern, reason } of QWEN_SIGNALS) {
    if (pattern.test(taskStr)) {
      return { tier: 'qwen3', id: 'ollama/qwen3:8b', reason };
    }
  }

  // Then check Opus — high-stakes tasks escalate above Sonnet
  for (const { pattern, reason } of OPUS_SIGNALS) {
    if (pattern.test(taskStr)) {
      return { tier: 'opus', id: 'anthropic/claude-opus-4-6', reason };
    }
  }

  // Default: Sonnet handles everything in between
  return { tier: 'sonnet', id: 'anthropic/claude-sonnet-4-6', reason: 'standard task — Sonnet default' };
}

// ─── OUTPUT ───────────────────────────────────────────────────────────────────

const result = classify(task);

if (jsonMode) {
  console.log(JSON.stringify({ task, ...result }, null, 2));
} else if (explainMode) {
  const icons = { qwen3: '🏠', sonnet: '⚡', opus: '🔥' };
  console.log(`Task:   "${task}"`);
  console.log(`Model:  ${icons[result.tier]} ${result.id}`);
  console.log(`Reason: ${result.reason}`);
} else {
  console.log(result.id);
}
