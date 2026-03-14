#!/usr/bin/env node
// OK Computer deploy script
// Deploys an HTML file to an OK Computer NFT's onchain storage.
//
// Required env vars:
//   OK_PRIVATE_KEY   — private key of the NFT owner wallet
//   OK_TOKEN_ID      — token ID of the OK Computer NFT (e.g. 1028)
//   OK_STORAGE_KEY   — bytes32 storage key for the page slot
//
// Optional env vars:
//   OK_RPC           — Base RPC URL (default: https://mainnet.base.org)
//
// Usage:
//   OK_PRIVATE_KEY=0x... OK_TOKEN_ID=1028 OK_STORAGE_KEY=0x... node deploy.js <html-file>

const fs = require('fs');
const { ethers } = require('ethers');

const PRIVATE_KEY = process.env.OK_PRIVATE_KEY;
const TOKEN_ID    = BigInt(process.env.OK_TOKEN_ID || '0');
const STORAGE_KEY = process.env.OK_STORAGE_KEY;
const RPC         = process.env.OK_RPC || 'https://mainnet.base.org';

// Contract is the same for all OK Computer NFTs
const CONTRACT = '0x04d7c8b512d5455e20df1e808f12cad1e3d766e5';

const ABI = [
  {
    "inputs": [
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" },
      { "internalType": "bytes32", "name": "key",     "type": "bytes32" },
      { "internalType": "string",  "name": "value",   "type": "string"  }
    ],
    "name": "storeString",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

async function deploy() {
  const [,, htmlFile] = process.argv;

  if (!htmlFile) {
    console.error('Usage: node deploy.js <html-file>');
    process.exit(1);
  }
  if (!PRIVATE_KEY) {
    console.error('❌ Missing OK_PRIVATE_KEY env var');
    process.exit(1);
  }
  if (!TOKEN_ID || TOKEN_ID === 0n) {
    console.error('❌ Missing or invalid OK_TOKEN_ID env var');
    process.exit(1);
  }
  if (!STORAGE_KEY || !STORAGE_KEY.startsWith('0x')) {
    console.error('❌ Missing or invalid OK_STORAGE_KEY env var (must be 0x-prefixed bytes32)');
    process.exit(1);
  }

  const html = fs.readFileSync(htmlFile, 'utf8');

  if (html.length > 98304) {
    console.error(`❌ File too large: ${html.length} bytes (max 96KB)`);
    process.exit(1);
  }

  console.log(`File:     ${htmlFile} (${html.length} bytes)`);
  console.log(`Contract: ${CONTRACT}`);
  console.log(`Token ID: ${TOKEN_ID}`);
  console.log(`Key:      ${STORAGE_KEY}`);
  console.log(`RPC:      ${RPC}`);

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT, ABI, wallet);

  console.log('\nRunning static call first...');
  try {
    await contract.storeString.staticCall(TOKEN_ID, STORAGE_KEY, html);
    console.log('✅ Static call passed');
  } catch (e) {
    console.error('❌ Static call failed:', e.reason || e.message.substring(0, 120));
    console.error('Contract may be in cooldown (~24h per key) — try again later');
    process.exit(1);
  }

  console.log('\nSending transaction...');
  const tx = await contract.storeString(TOKEN_ID, STORAGE_KEY, html, {
    gasLimit: 10_000_000n
  });

  console.log(`TX hash: ${tx.hash}`);
  console.log('Waiting for confirmation...');
  const receipt = await tx.wait();

  if (receipt.status === 1) {
    console.log('\n✅ SUCCESS!');
    console.log(`Gas used: ${receipt.gasUsed.toString()}`);
    console.log(`Block:    ${receipt.blockNumber}`);
    console.log(`TX:       https://basescan.org/tx/${tx.hash}`);
    console.log(`View:     https://${TOKEN_ID}.okcomputers.eth.limo`);
  } else {
    console.error('❌ Transaction reverted on-chain (status=0)');
    process.exit(1);
  }
}

deploy().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
