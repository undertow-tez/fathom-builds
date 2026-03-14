---
name: ok-computer
description: Deploy and update HTML art pages on OK Computer #1028 (1028.okcomputers.eth.limo). Use when asked to update, change, or deploy a new page to OK Computer, create onchain generative art for the NFT, or publish HTML to the OK Computers onchain storage contract on Base. Triggers on phrases like "update OK Computer", "deploy to 1028", "change the OK Computer page", "publish art to okcomputers".
---

# OK Computer

Deploys HTML to OK Computer token #1028 via the OK Computers onchain storage contract on Base.

## Critical Contract Details

- **Contract:** `0x04d7c8b512d5455e20df1e808f12cad1e3d766e5` (OK Computers: Onchain Storage)
- **Token ID:** `1028`
- **Function:** `storeString(uint256,bytes32,string)` — selector `0x6f711443`
- **Key (bytes32):** `0xfc77a78c81db9794340a10dbcb0632f44d2d889f2cac2911b039a50f90ead7d0`
- **Wallet:** `0xd11F70B81b7851a32a10eCAc8F538f8187b8deF5` (identity wallet, NFT owner)
- **Private key env var:** `PRIMARY_PRIVATE_KEY` (from `.cron_env`)
- **Live URL:** `https://1028.okcomputers.eth.limo`

## ⚠️ Critical Warnings

1. **bytes32 key, NOT string** — The function signature is `storeString(uint256,bytes32,string)`. Using `string` for the key silently reverts with only ~246k gas. Real success uses ~2-3M gas and emits an event.
2. **Always run static call first** — `contract.storeString.staticCall(...)` before sending tx. If it reverts, there's a cooldown active (can only write once per ~24h window).
3. **Check receipt.status** — viem's `writeContract` may return a hash for a reverted tx. Always verify `receipt.status === 1`.
4. **Use 0xd11 identity wallet** — NOT the Bankr trading wallet (0x0879).

## Deploy Workflow

```bash
# 1. Source credentials
source ~/.openclaw/workspace/.cron_env

# 2. Run the deploy script (static call + tx + status check built in)
node skills/ok-computer/scripts/deploy.js <html-file>
```

The script:
- Runs static call first (aborts cleanly if cooldown active)
- Sends tx with 10M gas limit
- Verifies receipt.status === 1
- Reports gas used (expect ~2-3M for success, ~246k = silent revert)

## v1.1 Upgrade (Latest - March 2026)

OK Computers v1.1 is live with major new capabilities:
- **JavaScript support** — build onchain games and interactive sites
- **PWA support** — pages can be installed like a phone app
- **Message board upgrades + usernames**
- **Dedicated RPC** — no rate limits
- **Gas fees ~1¢** per transaction

## Content Guidelines (Official from OK Computer dev)

- **Max size: 96KB** per page
- **NO external dependencies** — only inline styles, inline scripts, and embedded Base64 images
- No CDN links, no `<link rel="stylesheet">`, no `<script src="...">`, no Google Fonts, nothing external
- Self-contained animations via `<script>` and `requestAnimationFrame` or `setInterval`
- Base64-encode any images and embed directly in the HTML
- For development/testing: use PlayCode (playcode.io) or JS Bin (jsbin.com), then paste final HTML here for deploy
- Terminal command to view: `page 1028` (from OK Computer terminal)
- Previous successful styles: cellular automata, bioluminescent organisms, generative art, interactive simulations

## Cooldown

The contract limits writes to approximately once per 24-hour window per key. If the static call reverts with `require(false)`, wait and retry. The cooldown resets ~24h after the last successful write.

## Verifying Success

A real successful deploy shows:
- Static call passes ✅
- Gas used: ~2-3M (not ~246k)
- `receipt.status === 1`
- Event emitted with topics: `[0xfbbc794d..., tokenId, key, writer_address]`

See `references/contract.md` for full ABI and transaction history.
