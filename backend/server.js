const express = require('express');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { ethers } = require('ethers');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());

// Updated Blockchain Setup section
// ───────────────────────────────────────────────────────────────────────────────
// Blockchain Setup with Dynamic ABI Loading
// ───────────────────────────────────────────────────────────────────────────────
const provider = new ethers.JsonRpcProvider(process.env.POLYGON_ZKEVM_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contractAddress = process.env.CONTRACT_ADDRESS;

// Validate and load ABI from environment-specified path
if (!process.env.ABI_FILE_PATH) {
  console.error('Fatal Error: ABI_FILE_PATH not defined in environment variables');
  process.exit(1);
}

let contractABI;
try {
  const artifactContent = fs.readFileSync(process.env.ABI_FILE_PATH, 'utf8');
  const artifact = JSON.parse(artifactContent);
  
  // Extract ABI from Foundry/Forge artifact format
  if (!artifact.abi) {
    throw new Error('ABI not found in contract artifact');
  }
  
  contractABI = artifact.abi;
  console.log(`Successfully loaded ABI from ${process.env.ABI_FILE_PATH}`);
} catch (error) {
  console.error('ABI Loading Error:', error.message);
  process.exit(1);
}

// Validate ABI structure
if (!Array.isArray(contractABI)) {
  console.error('Invalid ABI structure - expected an array');
  process.exit(1);
}

const contract = new ethers.Contract(contractAddress, contractABI, wallet);

// ───────────────────────────────────────────────────────────────────────────────
// Updated IPFS Upload Function
// ───────────────────────────────────────────────────────────────────────────────
async function uploadToIPFS(fileBuffer, filename) {
  const formData = new FormData();
  formData.append('file', fileBuffer, { 
    filename,
    contentType: 'application/json' 
  });

  try {
    const response = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      formData,
      {
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: {
          Authorization: `Bearer ${process.env.PINATA_JWT}`,
          ...formData.getHeaders()
        }
      }
    );
    console.log(`IPFS Upload Success: CID ${response.data.IpfsHash}`);
    return response.data.IpfsHash;
  } catch (error) {
    console.error('IPFS Upload Failed:', error.response?.data || error.message);
    throw new Error('IPFS upload service unavailable');
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Enhanced Vulnerability Submission Route
// ───────────────────────────────────────────────────────────────────────────────
app.post('/addVulnerability', async (req, res) => {
  try {
    // Validate request parameters
    if (!req.body.filePath) {
      return res.status(400).json({ 
        error: 'filePath parameter is required' 
      });
    }

    // Read and validate JSON file
    const filePath = req.body.filePath;
    let vulnerabilityData;
    try {
      vulnerabilityData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      return res.status(400).json({
        error: 'Invalid vulnerability file',
        details: error.message
      });
    }

    // Validate required fields
    const requiredFields = ['id', 'title', 'description', 'severity'];
    const missingFields = requiredFields.filter(f => !vulnerabilityData[f]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        missing: missingFields
      });
    }

    // Upload to IPFS
    const fileBuffer = Buffer.from(JSON.stringify(vulnerabilityData, null, 2));
    const ipfsCid = await uploadToIPFS(fileBuffer, `${vulnerabilityData.id}.json`);

    // Blockchain interaction
    const idBytes32 = ethers.encodeBytes32String(vulnerabilityData.id);
    const tx = await contract.addVulnerability(
      idBytes32,
      vulnerabilityData.title,
      vulnerabilityData.description,
      ipfsCid
    );
    
    const receipt = await tx.wait();

    console.log(`Blockchain Transaction Success: TxHash ${tx.hash} mined in block ${receipt.blockNumber}`);

    res.status(201).json({
      message: 'Vulnerability recorded',
      blockchain: {
        txHash: tx.hash,
        block: receipt.blockNumber,
        contract: contractAddress
      },
      ipfs: {
        cid: ipfsCid,
        url: `https://ipfs.io/ipfs/${ipfsCid}`
      }
    });

  } catch (error) {
    console.error('Submission Error:', error);
    const statusCode = error.message.includes('already exists') ? 409 : 500;
    res.status(statusCode).json({
      error: 'Submission failed',
      details: error.message
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// Improved Vulnerability Retrieval Route
// ───────────────────────────────────────────────────────────────────────────────
app.get('/getVulnerability/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID format
    if (!/^BVC-[A-Z]{3}-\d{3}$/.test(id)) {
      return res.status(400).json({
        error: 'Invalid ID format',
        expectedFormat: 'BVC-XXX-000 (X=uppercase letter, 0=digit)'
      });
    }

    // Blockchain lookup
    const idBytes32 = ethers.encodeBytes32String(id);
    const vulnerability = await contract.getVulnerability(idBytes32);

    // Check existence
    if (vulnerability.id === ethers.ZeroHash) {
      return res.status(404).json({ 
        error: 'Vulnerability not found' 
      });
    }

    // Fetch IPFS data
    let ipfsData = null;
    if (vulnerability.ipfsCid) {
      try {
        const response = await axios.get(
          `https://gateway.pinata.cloud/ipfs/${vulnerability.ipfsCid}`,
          { timeout: 3000 }
        );
        ipfsData = response.data;
      } catch (ipfsError) {
        console.warn('IPFS metadata fetch failed:', ipfsError.message);
      }
    }

    // Format response
    res.json({
      id: id,
      title: vulnerability.title,
      description: vulnerability.description,
      version: vulnerability.version.toString(),
      status: vulnerability.isActive ? 'active' : 'inactive',
      ipfs: {
        cid: vulnerability.ipfsCid,
        data: ipfsData
      },
      contract: contractAddress
    });

  } catch (error) {
    console.error('Retrieval Error:', error);
    res.status(500).json({
      error: 'Failed to retrieve vulnerability',
      details: error.message
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// Health Check Endpoint
// ───────────────────────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const checks = {
    blockchain_connected: false,
    ipfs_available: false,
    contract_accessible: false
  };

  try {
    // Check blockchain connection
    await provider.getBlockNumber();
    checks.blockchain_connected = true;

    // Check contract access
    await contract.getAllVulnerabilityIds();
    checks.contract_accessible = true;

    // Check IPFS gateway
    await axios.head('https://gateway.pinata.cloud', { timeout: 2000 });
    checks.ipfs_available = true;

    res.json({
      status: 'OK',
      checks,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'SERVICE_UNAVAILABLE',
      checks,
      error: error.message
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// RPC Network Validation
// ───────────────────────────────────────────────────────────────────────────────
async function validateNetwork() {
  try {
    const network = await provider.getNetwork();
    console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);
    return true;
  } catch (error) {
    console.error('Network connection failed:', error.message);
    console.error('Please check your RPC URL in .env file');
    process.exit(1);
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Server Initialization
// ───────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
validateNetwork().then(() => {
  app.listen(PORT, () => {
    console.log(`Service operational on port ${PORT}`);
    console.log(`Network: ${process.env.POLYGON_ZKEVM_RPC_URL}`);
    console.log(`Contract: ${contractAddress}`);
  });
});