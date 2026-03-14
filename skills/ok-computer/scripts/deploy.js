#!/usr/bin/env node
// deploy-ok-computer-bytes32.js
// Correct function: storeString(uint256,bytes32,string) selector 0x6f711443
// Usage: node deploy-ok-computer-bytes32.js <html-file>

const fs = require('fs');
const { ethers } = require('ethers');

const PRIVATE_KEY = process.env.PRIMARY_PRIVATE_KEY;
const CONTRACT = '0x04d7c8b512d5455e20df1e808f12cad1e3d766e5';
const TOKEN_ID = 1028n;
const KEY = '0xfc77a78c81db9794340a10dbcb0632f44d2d889f2cac2911b039a50f90ead7d0';

const ABI = [
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
];

async function deploy() {
  const [,, htmlFile] = process.argv;
  if (!htmlFile) {
    console.error('Usage: node deploy-ok-computer-bytes32.js <html-file>');
    process.exit(1);
  }

  const html = fs.readFileSync(htmlFile, 'utf8');
  console.log(`File: ${htmlFile} (${html.length} bytes)`);
  console.log(`Contract: ${CONTRACT}`);
  console.log(`Token ID: ${TOKEN_ID}`);
  console.log(`Key (bytes32): ${KEY}`);

  const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT, ABI, wallet);

  console.log('\nRunning static call first...');
  try {
    await contract.storeString.staticCall(TOKEN_ID, KEY, html);
    console.log('✅ Static call passed');
  } catch (e) {
    console.error('❌ Static call failed:', e.reason || e.message.substring(0, 100));
    console.error('Contract is likely in cooldown - try again later');
    process.exit(1);
  }

  console.log('\nSending transaction...');
  const tx = await contract.storeString(TOKEN_ID, KEY, html, {
    gasLimit: 10000000n
  });

  console.log(`TX hash: ${tx.hash}`);
  console.log('Waiting for confirmation...');
  const receipt = await tx.wait();

  if (receipt.status === 1) {
    console.log('✅ SUCCESS!');
    console.log(`Gas used: ${receipt.gasUsed.toString()}`);
    console.log(`Block: ${receipt.blockNumber}`);
    console.log('View at: https://1028.okcomputers.eth.limo');
  } else {
    console.error('❌ Transaction reverted on-chain');
    process.exit(1);
  }
}

deploy().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
