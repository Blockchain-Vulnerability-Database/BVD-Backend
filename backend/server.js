const express = require('express');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { ethers } = require('ethers');
const { toUtf8Bytes } = ethers;
const crypto = require('crypto');
const path = require('path');
const morgan = require('morgan'); 
require('dotenv').config();

const app = express();
app.use(express.json());

// ───────────────────────────────────────────────────────────────────────────────
// Logging
// ───────────────────────────────────────────────────────────────────────────────

const logDir = path.join(__dirname, 'logs');
// Create logs directory if it doesn't exist
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Set up request logging middleware
app.use(morgan('[:date[iso]] :method :url :status :response-time ms - :res[content-length]'));

// Create a logger helper function
function logger(route, type, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    route,
    type,
    message,
    data
  };
  
  console.log(`[${timestamp}] [${route}] [${type}] ${message}`);
  
  if (data) {
    if (type === 'error') {
      console.error(data);
    } else {
      console.log('Additional data:', data);
    }
  }
  
  // Write to log file
  const logFile = path.join(logDir, `${new Date().toISOString().split('T')[0]}.log`);
  fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
}

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
  logger('addVulnerability', 'info', 'Request received', { filePath: req.body.filePath });
  
  try {
    // Validate request parameters
    if (!req.body.filePath) {
      logger('addVulnerability', 'error', 'Missing filePath parameter');
      return res.status(400).json({ 
        error: 'filePath parameter is required' 
      });
    }

    // Read and validate JSON file
    const filePath = req.body.filePath;
    let vulnerabilityData;
    try {
      vulnerabilityData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      logger('addVulnerability', 'info', 'File loaded successfully', { id: vulnerabilityData.id });
    } catch (error) {
      logger('addVulnerability', 'error', 'Invalid vulnerability file', { error: error.message });
      return res.status(400).json({
        error: 'Invalid vulnerability file',
        details: error.message
      });
    }

    // Validate required fields
    const requiredFields = ['id', 'title', 'description', 'severity', 'platform'];
    const missingFields = requiredFields.filter(f => !vulnerabilityData[f]);
    if (missingFields.length > 0) {
      logger('addVulnerability', 'error', 'Missing required fields', { missing: missingFields });
      return res.status(400).json({
        error: 'Missing required fields',
        missing: missingFields
      });
    }

    // Upload to IPFS
    logger('addVulnerability', 'info', 'Uploading to IPFS', { id: vulnerabilityData.id });
    const fileBuffer = Buffer.from(JSON.stringify(vulnerabilityData, null, 2));
    const ipfsCid = await uploadToIPFS(fileBuffer, `${vulnerabilityData.id}.json`);
    logger('addVulnerability', 'info', 'IPFS upload complete', { id: vulnerabilityData.id, cid: ipfsCid });

    // Generate ID using same keccak256 hashing as contract
    const idBytes32 = ethers.keccak256(ethers.toUtf8Bytes(vulnerabilityData.id));
    logger('addVulnerability', 'info', 'Generated bytes32 ID', { 
      textId: vulnerabilityData.id, 
      bytes32Id: idBytes32 
    });

    // Submit to blockchain
    logger('addVulnerability', 'info', 'Submitting to blockchain', { id: vulnerabilityData.id });
    const tx = await contract.addVulnerability(
      idBytes32,
      vulnerabilityData.title,
      vulnerabilityData.description,
      ipfsCid,
      vulnerabilityData.platform // Add platform parameter
    );
    
    logger('addVulnerability', 'info', 'Transaction submitted', { 
      id: vulnerabilityData.id,
      txHash: tx.hash 
    });
    
    // Wait for confirmation
    const receipt = await tx.wait();
    logger('addVulnerability', 'info', 'Transaction confirmed', { 
      id: vulnerabilityData.id,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber 
    });

    // Log success with both ID formats
    const successMessage = `Successfully added vulnerability:
    - Text ID: ${vulnerabilityData.id}
    - Bytes32 ID: ${idBytes32}
    - Platform: ${vulnerabilityData.platform}
    - TX Hash: ${tx.hash}
    - Block: ${receipt.blockNumber}`;
    
    logger('addVulnerability', 'success', successMessage);

    res.status(201).json({
      message: 'Vulnerability recorded',
      identifiers: {
        text: vulnerabilityData.id,
        bytes32: idBytes32
      },
      platform: vulnerabilityData.platform,
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
    logger('addVulnerability', 'error', 'Submission error', { 
      error: error.message,
      stack: error.stack 
    });
    
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
  const { id } = req.params;
  logger('getVulnerability', 'info', 'Request received', { id });
  
  try {
    // Validate ID format
    if (!/^BVC-[A-Z]{3}-\d{3}$/.test(id)) {
      logger('getVulnerability', 'error', 'Invalid ID format', { id });
      return res.status(400).json({
        error: 'Invalid ID format',
        expectedFormat: 'BVC-XXX-000 (X=uppercase letter, 0=digit)'
      });
    }

    // Generate ID using same method as contract
    const idBytes32 = ethers.keccak256(ethers.toUtf8Bytes(id));
    logger('getVulnerability', 'info', 'Generated bytes32 ID', { 
      textId: id, 
      bytes32Id: idBytes32 
    });

    try {
      // Get vulnerability details from contract
      logger('getVulnerability', 'info', 'Fetching from blockchain', { id });
      const vulnerability = await contract.getVulnerability(idBytes32);

      // Check existence using version number (0 = not found)
      if (vulnerability.version.toString() === "0") {
        logger('getVulnerability', 'warn', 'Vulnerability not found', { id, bytes32Id: idBytes32 });
        return res.status(404).json({ 
          error: 'Vulnerability not found',
          details: `No entry for ID: ${id} (${idBytes32})`
        });
      }

      logger('getVulnerability', 'info', 'Vulnerability found on blockchain', { 
        id,
        title: vulnerability.title,
        platform: vulnerability.platform,
        ipfsCid: vulnerability.ipfsCid 
      });

      // Retrieve IPFS metadata if available
      let ipfsData = null;
      if (vulnerability.ipfsCid) {
        try {
          logger('getVulnerability', 'info', 'Fetching IPFS metadata', { 
            id, 
            cid: vulnerability.ipfsCid 
          });
          
          const response = await axios.get(
            `https://gateway.pinata.cloud/ipfs/${vulnerability.ipfsCid}`,
            { timeout: 3000 }
          );
          ipfsData = response.data;
          logger('getVulnerability', 'info', 'IPFS metadata retrieved', { id });
        } catch (ipfsError) {
          logger('getVulnerability', 'warn', 'IPFS fetch failed', { 
            id, 
            cid: vulnerability.ipfsCid,
            error: ipfsError.message 
          });
        }
      }

      // Format comprehensive response
      const responseData = {
        id: id,
        bytes32Id: idBytes32,
        title: vulnerability.title,
        description: vulnerability.description,
        platform: vulnerability.platform,
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
      };
      
      logger('getVulnerability', 'success', 'Full vulnerability data retrieved', { id });
      res.json(responseData);

    } catch (error) {
      // Handle zkEVM-specific error format
      if (error.info?.error?.message?.includes('invalid opcode: MCOPY')) {
        logger('getVulnerability', 'error', 'zkEVM error - vulnerability not found', { 
          id, 
          bytes32Id: idBytes32 
        });
        return res.status(404).json({ 
          error: 'Vulnerability not found',
          details: `zkEVM error for ID: ${id} (${idBytes32})`
        });
      }
      
      // Handle general contract errors
      if (error.code === 'CALL_EXCEPTION') {
        logger('getVulnerability', 'error', 'Contract revert error', { 
          id, 
          bytes32Id: idBytes32, 
          code: error.code 
        });
        return res.status(404).json({ 
          error: 'Vulnerability not found',
          details: `Contract reverted for ID: ${id} (${idBytes32})`
        });
      }

      // Rethrow unexpected errors
      logger('getVulnerability', 'error', 'Unexpected contract error', { 
        id, 
        error: error.message 
      });
      throw error;
    }

  } catch (error) {
    logger('getVulnerability', 'error', 'Retrieval error', { 
      id, 
      error: error.message,
      stack: error.stack 
    });
    
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
  logger('getAllVulnerabilities', 'info', 'Request received');
  
  try {
    let allIds;

    // Fetch all vulnerability IDs from the smart contract
    try {
      logger('getAllVulnerabilities', 'info', 'Fetching all vulnerability IDs from contract');
      allIds = await contract.getAllVulnerabilityIds();
      logger('getAllVulnerabilities', 'info', `Retrieved ${allIds.length} vulnerability IDs`);
    } catch (error) {
      logger('getAllVulnerabilities', 'error', 'Failed to fetch vulnerability IDs', {
        error: error.message
      });
      return res.status(500).json({ 
        status: "error", 
        message: "Blockchain query failed. Ensure the contract has getAllVulnerabilityIds() or try a different RPC provider." 
      });
    }

    if (!allIds || allIds.length === 0) {
      logger('getAllVulnerabilities', 'warn', 'No vulnerabilities found');
      return res.status(404).json({ status: "error", message: "No vulnerabilities found in the contract." });
    }

    let vulnerabilities = [];

    // Fetch details for each vulnerability
    logger('getAllVulnerabilities', 'info', `Processing ${allIds.length} vulnerabilities`);
    for (const id of allIds) {
      logger('getAllVulnerabilities', 'info', `Fetching details for vulnerability ID: ${id}`);
      let vuln;
      try {
        vuln = await contract.getVulnerability(id);
        logger('getAllVulnerabilities', 'info', `Retrieved vulnerability details for ID: ${id}`, {
          title: vuln.title
        });
      } catch (error) {
        logger('getAllVulnerabilities', 'error', `Failed to fetch vulnerability ${id}`, {
          error: error.message
        });
        continue; // Skip if this one fails
      }

      let ipfsMetadata = null;
      let ipfsStatus = "Not Available";

      // Retrieve metadata from IPFS
      if (vuln.ipfsCid) {
        logger('getAllVulnerabilities', 'info', `Fetching IPFS metadata for ID: ${id}`, {
          cid: vuln.ipfsCid
        });
        try {
          const ipfsResponse = await axios.get(`https://gateway.pinata.cloud/ipfs/${vuln.ipfsCid}`);
          ipfsMetadata = ipfsResponse.data;
          ipfsStatus = "Retrieved Successfully";
          logger('getAllVulnerabilities', 'info', `IPFS metadata retrieved for ID: ${id}`);
        } catch (ipfsError) {
          logger('getAllVulnerabilities', 'warn', `Failed to fetch IPFS metadata for ${id}`, {
            error: ipfsError.message
          });
          ipfsStatus = "Failed to Retrieve";
        }
      }

      // Don't try to decode the id - it's a hash, not an encoded string
      vulnerabilities.push({
        id: id, // Keep as bytes32 hex string
        rawId: id, // For compatibility
        title: vuln.title,
        description: vuln.description,
        platform: vuln.platform,
        ipfsCid: vuln.ipfsCid,
        isActive: vuln.isActive,
        blockchainStatus: "Stored on Blockchain",
        ipfsStatus: ipfsStatus,
        metadata: ipfsMetadata,
      });
      
      logger('getAllVulnerabilities', 'info', `Processed vulnerability ID: ${id}`);
    }

    logger('getAllVulnerabilities', 'success', `Successfully retrieved ${vulnerabilities.length} vulnerabilities`);
    res.json({ status: "success", vulnerabilities });

  } catch (error) {
    logger('getAllVulnerabilities', 'error', 'Error fetching all vulnerabilities', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ status: "error", message: "Unexpected server error while fetching vulnerabilities." });
  }
});


// ───────────────────────────────────────────────────────────────────────────────
// Health Check Endpoint
// ───────────────────────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  logger('health', 'info', 'Health check requested');
  
  const checks = {
    blockchain_connected: false,
    ipfs_available: false,
    contract_accessible: false
  };

  try {
    // Check blockchain connection
    logger('health', 'info', 'Checking blockchain connection');
    await provider.getBlockNumber();
    checks.blockchain_connected = true;
    logger('health', 'info', 'Blockchain connection successful');

    // Check contract access
    logger('health', 'info', 'Checking contract accessibility');
    await contract.getAllVulnerabilityIds();
    checks.contract_accessible = true;
    logger('health', 'info', 'Contract access successful');

    // Check IPFS gateway
    logger('health', 'info', 'Checking IPFS gateway');
    await axios.head('https://gateway.pinata.cloud', { timeout: 2000 });
    checks.ipfs_available = true;
    logger('health', 'info', 'IPFS gateway accessible');

    logger('health', 'success', 'Health check completed successfully');
    res.json({
      status: 'OK',
      checks,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger('health', 'error', 'Health check failed', {
      error: error.message,
      checks
    });
    
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