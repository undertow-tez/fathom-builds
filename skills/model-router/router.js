#!/usr/bin/env node
/**
 * model-router.js — Task-based model routing for Fathom
 * 
 * Routes between Qwen3:8b (local) and Claude Sonnet (API)
 * based on task type and consequence, not just complexity.
 *
 * Usage:
 *   node router.js "describe the task here"
 *   node router.js --json "describe the task here"
 *   node router.js --explain "describe the task here"
 */

const task = process.argv.slice(2).filter(a => !a.startsWith('--')).join(' ').toLowerCase();
const flags = process.argv.filter(a => a.startsWith('--'));
const jsonMode = flags.includes('--json');
const explainMode = flags.includes('--explain');

if (!task) {
  console.error('Usage: node router.js [--json] [--explain] "task description"');
  process.exit(1);
}

// --- Routing rules ---
// Order matters: first match wins. Claude rules first (conservative bias).

const CLAUDE_SIGNALS = [
  // Undertow-facing
  { pattern: /\b(undertow|message|telegram|reply|respond|brief|report|tell him|answer|chat)\b/, reason: 'Undertow-facing output' },
  // Financial decisions
  { pattern: /\b(trade|bet|buy|sell|position|leverage|polymarket|btc signal|eth signal|edge|stake|portfolio decision|invest)\b/, reason: 'financial decision' },
  // Creative / voice
  { pattern: /\b(write|narrative|script|marfa|creative|voice|tone|poem|story|art|design concept|draft)\b/, reason: 'creative/voice work' },
  // Security / irreversible
  { pattern: /\b(sign|wallet|private key|deploy|contract|irreversible|delete|drainer|transfer funds|send eth|send usdc)\b/, reason: 'security-sensitive' },
  // Complex reasoning
  { pattern: /\b(analyze|analyse|strategy|architect|debug|refactor|plan|decide|judge|compare|evaluate|diagnose|root cause)\b/, reason: 'complex reasoning required' },
  // Multi-step
  { pattern: /\b(then|and then|step \d|phase \d|first.*then|sequence|workflow|pipeline)\b/, reason: 'multi-step reasoning chain' },
  // Anything Undertow asked for directly
  { pattern: /\b(undertow asked|he wants|he said|he requested|he needs)\b/, reason: 'Undertow direct request' },
];

const QWEN_SIGNALS = [
  // Heartbeat / ack
  { pattern: /\b(heartbeat|heartbeat_ok|ack|nothing to report|status check|is it running|cron healthy)\b/, reason: 'routine heartbeat/status' },
  // Price / data lookup
  { pattern: /\b(price|fetch price|current price|btc price|eth price|lookup|get price|coingecko)\b/, reason: 'data lookup' },
  // File ops
  { pattern: /\b(update state\.md|write to|append to|log|read file|write file|update memory|daily notes)\b/, reason: 'file operation' },
  // Social (formulaic)
  { pattern: /\b(botchan post|4claw post|routine post|daily post|template post)\b/, reason: 'formulaic social post' },
  // Machine checks
  { pattern: /\b(machine running|is.*running|check cron|cron status|lock file|verify script|process running|ps aux|systemctl|service status)\b/, reason: 'machine/process check' },
  // Formatting
  { pattern: /\b(format|reformat|summarize log|parse|convert|extract from|transform data)\b/, reason: 'data formatting' },
];

function classify(taskStr) {
  // Qwen signals checked FIRST for clearly routine tasks —
  // prevents Claude patterns from over-triggering on words like "report" in "nothing to report"
  for (const { pattern, reason } of QWEN_SIGNALS) {
    if (pattern.test(taskStr)) {
      return { model: 'qwen3', id: 'ollama/qwen3:8b', reason };
    }
  }

  // Then Claude signals for anything requiring judgment/stakes
  for (const { pattern, reason } of CLAUDE_SIGNALS) {
    if (pattern.test(taskStr)) {
      return { model: 'claude', id: 'anthropic/claude-sonnet-4-6', reason };
    }
  }

  // Default: Claude (conservative — unknown tasks go to the better model)
  return { model: 'claude', id: 'anthropic/claude-sonnet-4-6', reason: 'default (unknown task type — conservative routing)' };
}

const result = classify(task);

if (jsonMode) {
  console.log(JSON.stringify({ task, ...result }, null, 2));
} else if (explainMode) {
  console.log(`Task:   "${task}"`);
  console.log(`Model:  ${result.id}`);
  console.log(`Reason: ${result.reason}`);
} else {
  // Simple output: just the model id (for use in scripts)
  console.log(result.id);
}
