---
name: ok-computer
description: Deploy and update HTML art pages on OK Computer NFTs onchain. Use when asked to update, change, or deploy a new page to an OK Computer NFT, create onchain generative art, or publish HTML to the OK Computers onchain storage contract on Base. Triggers on phrases like "update OK Computer", "deploy to ok computer", "change the OK Computer page", "publish art to okcomputers".
---

# OK Computer

Deploys HTML to any OK Computer NFT via the OK Computers onchain storage contract on Base.

## Setup — Required Env Vars

```bash
export OK_PRIVATE_KEY=0x...         # Private key of the NFT owner wallet
export OK_TOKEN_ID=1028             # Your OK Computer token ID
export OK_STORAGE_KEY=0x...         # bytes32 storage key for the page slot
export OK_RPC=https://mainnet.base.org  # Optional, this is the default
```

The storage key is a bytes32 value tied to your NFT slot. To find your key, look up a prior successful `storeString` transaction on Basescan for your token and copy the `key` argument.

## Deploy

```bash
# Install dependency first (once)
npm install ethers

# Deploy an HTML file
node skills/ok-computer/scripts/deploy.js my-page.html
```

The script:
1. Validates env vars and file size (<96KB)
2. Runs a static call first — aborts cleanly if cooldown is active
3. Sends the transaction with 10M gas limit
4. Verifies `receipt.status === 1` (never trusts a hash alone)
5. Reports gas used (expect ~2-10M for success; ~246k = silent revert)

## Contract Details

- **Address:** `0x04d7c8b512d5455e20df1e808f12cad1e3d766e5` (same for all tokens)
- **Chain:** Base mainnet (chainId 8453)
- **Function:** `storeString(uint256 tokenId, bytes32 key, string value)` — selector `0x6f711443`
- **RPC:** `https://mainnet.base.org` (use this; other RPCs have caused silent failures)
- **Viewing:** `https://<tokenId>.okcomputers.eth.limo` or terminal command `page <tokenId>`

## ⚠️ Critical Warnings

1. **bytes32 key, NOT string** — The function signature takes `bytes32` for the key. Using a `string` ABI silently reverts with only ~246k gas. Real success uses ~2-10M gas and emits an event.
2. **Always static call first** — If it reverts, cooldown is active (~24h per key). Abort and retry later.
3. **Check receipt.status** — Some libraries return a tx hash for reverted transactions. Always verify `status === 1`.
4. **Only the NFT owner wallet can write.** Ensure your `OK_PRIVATE_KEY` controls the token.

## v1.1 Upgrade (March 2026)

OK Computers v1.1 added major new capabilities:
- **JavaScript support** — build onchain games and fully interactive sites
- **PWA support** — pages can be installed like a phone app
- **Message board upgrades + usernames**
- **Dedicated RPC** — no rate limits
- **Gas fees ~1¢** per transaction

## Content Rules (Official from OK Computer dev)

- **Max size: 96KB**
- **NO external dependencies** — only inline styles, inline scripts, and embedded Base64 images
- No CDN links, no external stylesheets, no external scripts, no web fonts
- Use PlayCode (playcode.io) or JS Bin (jsbin.com) to build/test before deploying

## Cooldown

The contract limits writes to approximately once per 24-hour window per key. If the static call reverts with `require(false)`, wait and retry later.

## Verifying Success

A real successful deploy shows:
- Static call passes ✅
- Gas used: ~2-10M (not ~246k)
- `receipt.status === 1`
- Event emitted with topics: `[0xfbbc794d..., tokenId, key, writer_address]`

See `references/contract.md` for full ABI and failure mode reference.
