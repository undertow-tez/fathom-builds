# Fathom Lines mainnet export

This branch contains the complete Fathom Lines mainnet archive for contract:

`0xce62f2a3f0ab5b5f0f5c71313cde70d96e14de23`

- Network: Ethereum Mainnet
- Tokens: 4,444
- Contents of the original ZIP: 4,444 decoded onchain metadata JSON files and 4,444 deterministic 2000×2000 SVG files
- Original ZIP SHA-256: `706dc338bdb01edc935840d581fe2fe2ff6eaa2bb4cbddcbc4db92be2ba2e3a0`

## Reassemble the ZIP

GitHub's regular Git file limit is 100 MB, so the 538.8 MB ZIP is stored as six 90 MB parts. From this directory, run:

```bash
cat parts/fathom-lines-mainnet-export.zip.part-* > fathom-lines-mainnet-export.zip
sha256sum fathom-lines-mainnet-export.zip
unzip -t fathom-lines-mainnet-export.zip
```

The resulting SHA-256 should be:

```text
706dc338bdb01edc935840d581fe2fe2ff6eaa2bb4cbddcbc4db92be2ba2e3a0
```
