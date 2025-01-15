// Import libraries
const { Web3 } = require('web3');
const { Wallet } = require('ethers');

// Private key to test
const privateKey = 'a747c0396083e0c98d6874d688d5c91900e896e121b058ce7a777d14d5ac95c7';

console.log(`Using PRIVATE_KEY (masked): ${privateKey.slice(0, 6)}...${privateKey.slice(-4)}`);

// Step 1: Validate the Private Key Format
console.log('Validating private key format...');

if (privateKey.length !== 64) {
  console.error('Invalid Private Key Length:', privateKey.length);
  console.error('Expected length: 64 characters.');
  process.exit(1);
}

if (!/^[a-fA-F0-9]+$/.test(privateKey)) {
  console.error('Invalid characters in Private Key. Ensure it is a hexadecimal string.');
  process.exit(1);
}

console.log('Private Key format validated successfully.');

// Step 2: Test with Web3.js
console.log('Testing account derivation with Web3.js...');
try {
  const web3 = new Web3();
  const account = web3.eth.accounts.privateKeyToAccount(privateKey);
  console.log('Derived address with Web3.js:', account.address);
} catch (error) {
  console.error('Error deriving account from PRIVATE_KEY with Web3.js:', error.message);
  console.error('Stack trace:', error.stack);
}

// Step 3: Test with ethers.js
console.log('Testing account derivation with ethers.js...');
try {
  const wallet = new Wallet(privateKey);
  console.log('Derived address with ethers.js:', wallet.address);
} catch (error) {
  console.error('Error deriving account from PRIVATE_KEY with ethers.js:', error.message);
  console.error('Stack trace:', error.stack);
}

// Final message
console.log('Private key test complete.');