require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const validateNetwork = async (provider) => {
  try {
    const network = await provider.getNetwork();
    console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);
    return true;
  } catch (error) {
    console.error('Network connection failed:', error.message);
    process.exit(1);
  }
};

const loadContract = () => {
  const provider = new ethers.JsonRpcProvider(process.env.POLYGON_ZKEVM_RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  
  // Load ABI
  let contractABI;
  try {
    const artifact = JSON.parse(fs.readFileSync(process.env.ABI_FILE_PATH, 'utf8'));
    if (!artifact.abi) throw new Error('ABI not found in contract artifact');
    contractABI = artifact.abi;
  } catch (error) {
    console.error('Contract config error:', error.message);
    process.exit(1);
  }

  return {
    provider,
    wallet,
    contract: new ethers.Contract(process.env.CONTRACT_ADDRESS, contractABI, wallet),
    validateNetwork: () => validateNetwork(provider)
  };
};

module.exports = {
  loadContract,
  contractConfig: loadContract()
};