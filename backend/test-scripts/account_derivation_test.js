const { Web3 } = require('web3');

// Replace with your private key
const privateKey = 'a747c0396083e0c98d6874d688d5c91900e896e121b058ce7a777d14d5ac95c7';

try {
  console.log(`Using PRIVATE_KEY (masked): ${privateKey.slice(0, 6)}...${privateKey.slice(-4)}`);
  
  // Initialize Web3
  const web3 = new Web3();
  
  // Attempt to derive the account from the private key
  console.log('Attempting to derive account...');
  const account = web3.eth.accounts.privateKeyToAccount(privateKey);

  // Log derived account details
  console.log(`Derived address: ${account.address}`);
} catch (error) {
  console.error('Error deriving account from PRIVATE_KEY:', error.message);
  console.error('Stack trace:', error.stack);
}