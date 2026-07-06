# Phase 3: Direct CLOB Execution (Roadmap)

**Status: not built. Build this only after shadow mode proves the weather edge** (`shadow-score.js` verdict ✅ at n≥50). This doc exists so the migration is planned, not improvised.

## Why Bankr isn't good enough for trading

Bankr is a great agent wallet and a bad trading terminal:

| Problem | Cost |
|---------|------|
| 2–8 min natural-language pipeline latency | The same-day obs-clamp edge decays in minutes — this is the single biggest leak |
| Market orders only | You pay the spread + whatever the book moved; no price control |
| No fill feedback until job completes | Can't react, can't cancel, can't partial-fill |
| Opaque routing/fees | Unmeasurable execution cost per trade |

Shadow mode measures the *model's* edge at quoted prices. Live-via-Bankr results will lag shadow results by exactly these execution costs — comparing the two (bets.jsonl fills vs shadow.jsonl quotes) tells you what CLOB migration is worth in $/bet before you build it.

## What direct execution looks like

Polymarket's CLOB has a public API with an official Python client ([`py-clob-client`](https://github.com/Polymarket/py-clob-client)). Sketch:

1. **Wallet**: a Polygon EOA the agent controls (NOT the Bankr custodial wallet — export/allocate a dedicated trading key with only the trading bankroll on it; keep it out of the repo and out of config.json).
2. **One-time setup**: USDC + CTF token approvals for the exchange contracts; derive CLOB API creds from the key (`create_or_derive_api_creds`).
3. **Market data**: token IDs per outcome come from the same Gamma API responses we already parse (`clobTokenIds`).
4. **Orders**: post **GTC limit orders** at the price the strategy computed (e.g., the recommendation price + 1¢ tolerance) instead of market-buying whatever's offered. Unfilled after N minutes → cancel, re-evaluate.
5. **Redemption**: winning positions redeem via the CTF contract (or keep using Bankr for redemption only — it's not latency-sensitive).

## Migration plan (keeps the rest of the skill unchanged)

`bet.sh` is the only place execution happens. Add an `executor` field to config:

```json
{ "executor": "bankr" }   // today
{ "executor": "clob" }    // after phase 3
```

`bet.sh` dispatches to `lib/bankr.sh` (current path) or a new `scripts/clob-order.py` with identical arguments and identical bets.jsonl logging. Strategies, cycles, redemption sweep, P&L, and shadow mode don't change at all.

## Effort estimate

~1 day of agent work: dependency setup (python3 + py-clob-client), key handling, allowance transactions, order placement + cancel loop, and a dry-run mode against the CLOB sandbox. The risky parts are key management and allowances — do them manually and carefully, once.
