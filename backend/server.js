const express = require('express');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { ethers } = require('ethers');
const { toUtf8Bytes } = ethers;
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());

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
// Vulnerability Submission Routes
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

    // Generate ID using same keccak256 hashing as contract
    const idBytes32 = ethers.keccak256(ethers.toUtf8Bytes(vulnerabilityData.id));

    // Submit to blockchain
    const tx = await contract.addVulnerability(
      idBytes32,
      vulnerabilityData.title,
      vulnerabilityData.description,
      ipfsCid
    );
    
    // Wait for confirmation
    const receipt = await tx.wait();

    // Log success with both ID formats
    console.log(`Successfully added vulnerability:
    - Text ID: ${vulnerabilityData.id}
    - Bytes32 ID: ${idBytes32}
    - TX Hash: ${tx.hash}
    - Block: ${receipt.blockNumber}`);

    res.status(201).json({
      message: 'Vulnerability recorded',
      identifiers: {
        text: vulnerabilityData.id,
        bytes32: idBytes32
      },
      blockchain: {
        txHash: tx.hash,
        block: receipt.blockNumber,
        contract: contractAddress
      },
      ipfs: {
        cid: ipfsCid,
        url: `https://gateway.pinata.cloud/ipfs/${ipfsCid}`
      }
    });

  } catch (error) {
    console.error('Submission Error:', error);
    
    // Enhanced error handling
    const statusCode = error.message.includes('already exists') ? 409 : 500;
    const errorMessage = error.message.includes('already exists') 
      ? `Vulnerability ID '${req.body.filePath?.id}' already exists` 
      : 'Submission failed';

    res.status(statusCode).json({
      error: errorMessage,
      details: error.info?.error?.message || error.message
    });
  }
});

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

    // Generate ID using same method as contract
    const idBytes32 = ethers.keccak256(ethers.toUtf8Bytes(id));

    try {
      // Get vulnerability details from contract
      const vulnerability = await contract.getVulnerability(idBytes32);

      // Check existence using version number (0 = not found)
      if (vulnerability.version.toString() === "0") {
        return res.status(404).json({ 
          error: 'Vulnerability not found',
          details: `No entry for ID: ${id} (${idBytes32})`
        });
      }

      // Retrieve IPFS metadata if available
      let ipfsData = null;
      if (vulnerability.ipfsCid) {
        try {
          const response = await axios.get(
            `https://gateway.pinata.cloud/ipfs/${vulnerability.ipfsCid}`,
            { timeout: 3000 }
          );
          ipfsData = response.data;
        } catch (ipfsError) {
          console.warn(`IPFS fetch failed for ${id}:`, ipfsError.message);
        }
      }

      // Format comprehensive response
      res.json({
        id: id,
        bytes32Id: idBytes32,
        title: vulnerability.title,
        description: vulnerability.description,
        version: vulnerability.version.toString(),
        status: vulnerability.isActive ? 'active' : 'inactive',
        ipfs: {
          cid: vulnerability.ipfsCid,
          data: ipfsData,
          url: `https://gateway.pinata.cloud/ipfs/${vulnerability.ipfsCid}`
        },
        blockchain: {
          contract: contractAddress,
          network: await provider.getNetwork()
        }
      });

    } catch (error) {
      // Handle zkEVM-specific error format
      if (error.info?.error?.message?.includes('invalid opcode: MCOPY')) {
        return res.status(404).json({ 
          error: 'Vulnerability not found',
          details: `zkEVM error for ID: ${id} (${idBytes32})`
        });
      }
      
      // Handle general contract errors
      if (error.code === 'CALL_EXCEPTION') {
        return res.status(404).json({ 
          error: 'Vulnerability not found',
          details: `Contract reverted for ID: ${id} (${idBytes32})`
        });
      }

      // Rethrow unexpected errors
      throw error;
    }

  } catch (error) {
    console.error('Retrieval Error:', error);
    res.status(500).json({
      error: 'Failed to retrieve vulnerability',
      details: error.message,
      debugInfo: {
        contractAddress,
        rpcUrl: process.env.POLYGON_ZKEVM_RPC_URL
      }
    });
  }
});

app.get('/getAllVulnerabilities', async (req, res) => {
  try {
    let allIds;

    // Fetch all vulnerability IDs from the smart contract
    try {
      allIds = await contract.getAllVulnerabilityIds();
    } catch (error) {
      console.error("Failed to fetch vulnerability IDs from contract:", error.message);
      return res.status(500).json({ 
        status: "error", 
        message: "Blockchain query failed. Ensure the contract has getAllVulnerabilityIds() or try a different RPC provider." 
      });
    }

    if (!allIds || allIds.length === 0) {
      return res.status(404).json({ status: "error", message: "No vulnerabilities found in the contract." });
    }

    let vulnerabilities = [];

    // Fetch details for each vulnerability
    for (const id of allIds) {
      let vuln;
      try {
        vuln = await contract.getVulnerability(id);
      } catch (error) {
        console.error(`Failed to fetch vulnerability ${id}:`, error.message);
        continue; // Skip if this one fails
      }

      let ipfsMetadata = null;
      let ipfsStatus = "Not Available";

      // Retrieve metadata from IPFS
      if (vuln.ipfsCid) {
        try {
          const ipfsResponse = await axios.get(`https://gateway.pinata.cloud/ipfs/${vuln.ipfsCid}`);
          ipfsMetadata = ipfsResponse.data;
          ipfsStatus = "Retrieved Successfully";
        } catch (ipfsError) {
          console.warn(`Failed to fetch IPFS metadata for ${id}:`, ipfsError.message);
          ipfsStatus = "Failed to Retrieve";
        }
      }

      vulnerabilities.push({
        id: ethers.decodeBytes32String(id),
        title: vuln.title,
        description: vuln.description,
        ipfsCid: vuln.ipfsCid,
        isActive: vuln.isActive,
        blockchainStatus: "Stored on Blockchain",
        ipfsStatus: ipfsStatus,
        metadata: ipfsMetadata,
      });
    }

    res.json({ status: "success", vulnerabilities });

  } catch (error) {
    console.error("Error fetching all vulnerabilities:", error);
    res.status(500).json({ status: "error", message: "Unexpected server error while fetching vulnerabilities." });
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