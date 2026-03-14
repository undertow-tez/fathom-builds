# OK Computer Contract Reference

## Contract Info

- **Name:** OK Computers: Onchain Storage
- **Address:** `0x04d7c8b512d5455e20df1e808f12cad1e3d766e5`
- **Chain:** Base (chainId 8453)
- **Token ID:** 1028
- **Live URL:** https://1028.okcomputers.eth.limo

## Write Function ABI

```json
{
  "inputs": [
    { "internalType": "uint256", "name": "tokenId", "type": "uint256" },
    { "internalType": "bytes32", "name": "key", "type": "bytes32" },
    { "internalType": "string", "name": "value", "type": "string" }
  ],
  "name": "storeString",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}
```

**Selector:** `0x6f711443`

## Storage Key

The page content is stored at this bytes32 key:
```
0xfc77a78c81db9794340a10dbcb0632f44d2d889f2cac2911b039a50f90ead7d0
```

## Event Emitted on Success

```
topic[0]: 0xfbbc794d2a165452ae3067abfd23d4ce1578c735148c19eee1587795485d9716
topic[1]: tokenId (0x0000...0404 = 1028)
topic[2]: key (0xfc77a78c...)
topic[3]: writer address (0xd11F70B8...)
```

## Known Working Transactions

| Date | TX Hash | Content | Gas Used |
|------|---------|---------|----------|
| Mar 8, 2026 | 0x0fbbb118... | ONE HOUR R... (15KB) | ~3.5M |
| Mar 8, 2026 | 0xa0f93823... | ONE HOUR R... (24KB) | ~5.5M |
| Mar 8, 2026 | 0xeac6e4a0... | ONE HOUR R... (19KB) | ~4.5M |
| Mar 13, 2026 AM | 0xb0d0dff4... | Dynamic Reef (21KB) | 7,570,842 |
| Mar 13, 2026 PM | 0x8f38092f... | Mission Control (5.5KB) | 2,854,322 |

## Official Page Rules (from OK Computer dev)

- **Max filesize: 96KB**
- **NO external dependencies** — only inline styles, inline scripts, embedded Base64 images
- No CDN links, no external stylesheets, no external scripts, no web fonts
- Viewing: terminal command `page 1028` (replace with your token number)
- Development tip: use PlayCode (playcode.io) or JS Bin (jsbin.com) to build/test, then paste final HTML for deploy

## RPC Endpoint

Use `https://mainnet.base.org` — other RPCs have caused silent failures.

## Common Failure Modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Gas used ~246k, status 0 | Wrong function ABI (string key instead of bytes32) | Use bytes32 ABI |
| `require(false)` on static call | 24h cooldown active | Wait and retry |
| Viem reports success but status=0 | viem doesn't check receipt.status | Always check receipt.status === 1 |
