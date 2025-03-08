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
    const baseIdBytes32 = ethers.keccak256(ethers.toUtf8Bytes(vulnerabilityData.id));
    logger('addVulnerability', 'info', 'Generated bytes32 base ID', { 
      textId: vulnerabilityData.id, 
      bytes32Id: baseIdBytes32 
    });

    // Submit to blockchain with updated contract function signature
    logger('addVulnerability', 'info', 'Submitting to blockchain', { id: vulnerabilityData.id });
    const tx = await contract.addVulnerability(
      baseIdBytes32,
      vulnerabilityData.title,
      vulnerabilityData.description,
      ipfsCid,
      vulnerabilityData.platform
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
    - Bytes32 Base ID: ${baseIdBytes32}
    - Platform: ${vulnerabilityData.platform}
    - TX Hash: ${tx.hash}
    - Block: ${receipt.blockNumber}`;
    
    logger('addVulnerability', 'success', successMessage);

    res.status(201).json({
      message: 'Vulnerability recorded',
      identifiers: {
        text: vulnerabilityData.id,
        bytes32BaseId: baseIdBytes32
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
    const baseIdBytes32 = ethers.keccak256(ethers.toUtf8Bytes(id));
    logger('getVulnerability', 'info', 'Generated bytes32 base ID', { 
      textId: id, 
      bytes32Id: baseIdBytes32 
    });

    try {
      // Get vulnerability details from contract using getLatestVulnerability
      logger('getVulnerability', 'info', 'Fetching from blockchain', { id });
      const vulnerability = await contract.getLatestVulnerability(baseIdBytes32);

      // Destructure the vulnerability data
      const [
        vulnId,
        version,
        baseId,
        title,
        description,
        ipfsCid,
        platform,
        isActive
      ] = vulnerability;

      // Log successful retrieval
      logger('getVulnerability', 'info', 'Vulnerability found on blockchain', { 
        id,
        title,
        platform,
        ipfsCid,
        version: version.toString()
      });

      // Retrieve IPFS metadata if available
      let ipfsData = null;
      if (ipfsCid) {
        try {
          logger('getVulnerability', 'info', 'Fetching IPFS metadata', { 
            id, 
            cid: ipfsCid 
          });
          
          const response = await axios.get(
            `https://gateway.pinata.cloud/ipfs/${ipfsCid}`,
            { timeout: 3000 }
          );
          ipfsData = response.data;
          logger('getVulnerability', 'info', 'IPFS metadata retrieved', { id });
        } catch (ipfsError) {
          logger('getVulnerability', 'warn', 'IPFS fetch failed', { 
            id, 
            cid: ipfsCid,
            error: ipfsError.message 
          });
        }
      }

      // Format comprehensive response
      const responseData = {
        id: id,
        bytes32BaseId: baseId,
        bytes32VersionId: vulnId,
        title,
        description,
        platform,
        version: version.toString(),
        status: isActive ? 'active' : 'inactive',
        ipfs: {
          cid: ipfsCid,
          data: ipfsData,
          url: ipfsCid ? `https://gateway.pinata.cloud/ipfs/${ipfsCid}` : null
        },
        blockchain: {
          contract: contractAddress,
          network: await provider.getNetwork()
        }
      };
      
      logger('getVulnerability', 'success', 'Full vulnerability data retrieved', { id });
      res.json(responseData);

    } catch (error) {
      // Handle case when vulnerability doesn't exist - "Vulnerability does not exist"
      if (error.message.includes('Vulnerability does not exist')) {
        logger('getVulnerability', 'error', 'Vulnerability not found', { 
          id, 
          bytes32Id: baseIdBytes32 
        });
        return res.status(404).json({ 
          error: 'Vulnerability not found',
          details: `No entry for ID: ${id} (${baseIdBytes32})`
        });
      }
      
      // Handle zkEVM-specific error format
      if (error.info?.error?.message?.includes('invalid opcode: MCOPY')) {
        logger('getVulnerability', 'error', 'zkEVM error - vulnerability not found', { 
          id, 
          bytes32Id: baseIdBytes32 
        });
        return res.status(404).json({ 
          error: 'Vulnerability not found',
          details: `zkEVM error for ID: ${id} (${baseIdBytes32})`
        });
      }
      
      // Handle general contract errors
      if (error.code === 'CALL_EXCEPTION') {
        logger('getVulnerability', 'error', 'Contract revert error', { 
          id, 
          bytes32Id: baseIdBytes32, 
          code: error.code 
        });
        return res.status(404).json({ 
          error: 'Vulnerability not found',
          details: `Contract reverted for ID: ${id} (${baseIdBytes32})`
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
    let allBaseIds;

    // Fetch all vulnerability base IDs from the smart contract
    try {
      logger('getAllVulnerabilities', 'info', 'Fetching all vulnerability base IDs from contract');
      allBaseIds = await contract.getAllBaseVulnerabilityIds();
      logger('getAllVulnerabilities', 'info', `Retrieved ${allBaseIds.length} vulnerability base IDs`);
    } catch (error) {
      logger('getAllVulnerabilities', 'error', 'Failed to fetch vulnerability base IDs', {
        error: error.message
      });
      return res.status(500).json({ 
        status: "error", 
        message: "Blockchain query failed. Ensure the contract has getAllBaseVulnerabilityIds() or try a different RPC provider." 
      });
    }

    if (!allBaseIds || allBaseIds.length === 0) {
      logger('getAllVulnerabilities', 'warn', 'No vulnerabilities found');
      return res.status(404).json({ status: "error", message: "No vulnerabilities found in the contract." });
    }

    let vulnerabilities = [];

    // Fetch details for each vulnerability's latest version
    logger('getAllVulnerabilities', 'info', `Processing ${allBaseIds.length} vulnerabilities`);
    for (const baseId of allBaseIds) {
      logger('getAllVulnerabilities', 'info', `Fetching details for vulnerability base ID: ${baseId}`);
      let vuln;
      try {
        vuln = await contract.getLatestVulnerability(baseId);
        const [vulnId, version, vulnBaseId, title, description, ipfsCid, platform, isActive] = vuln;
        
        logger('getAllVulnerabilities', 'info', `Retrieved vulnerability details for base ID: ${baseId}`, {
          title,
          version: version.toString()
        });
        
        let ipfsMetadata = null;
        let ipfsStatus = "Not Available";

        // Retrieve metadata from IPFS
        if (ipfsCid) {
          logger('getAllVulnerabilities', 'info', `Fetching IPFS metadata for base ID: ${baseId}`, {
            cid: ipfsCid
          });
          try {
            const ipfsResponse = await axios.get(`https://gateway.pinata.cloud/ipfs/${ipfsCid}`);
            ipfsMetadata = ipfsResponse.data;
            ipfsStatus = "Retrieved Successfully";
            logger('getAllVulnerabilities', 'info', `IPFS metadata retrieved for base ID: ${baseId}`);
          } catch (ipfsError) {
            logger('getAllVulnerabilities', 'warn', `Failed to fetch IPFS metadata for ${baseId}`, {
              error: ipfsError.message
            });
            ipfsStatus = "Failed to Retrieve";
          }
        }

        vulnerabilities.push({
          baseId: baseId,
          versionId: vulnId,
          version: version.toString(),
          title,
          description,
          platform,
          ipfsCid,
          isActive,
          blockchainStatus: "Stored on Blockchain",
          ipfsStatus: ipfsStatus,
          metadata: ipfsMetadata,
        });
        
      } catch (error) {
        logger('getAllVulnerabilities', 'error', `Failed to fetch vulnerability ${baseId}`, {
          error: error.message
        });
        continue; // Skip if this one fails
      }
      
      logger('getAllVulnerabilities', 'info', `Processed vulnerability base ID: ${baseId}`);
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

// Add new endpoint to get version history
app.get('/getVulnerabilityVersions/:id', async (req, res) => {
  const { id } = req.params;
  logger('getVulnerabilityVersions', 'info', 'Request received', { id });
  
  try {
    // Validate ID format
    if (!/^BVC-[A-Z]{3}-\d{3}$/.test(id)) {
      logger('getVulnerabilityVersions', 'error', 'Invalid ID format', { id });
      return res.status(400).json({
        error: 'Invalid ID format',
        expectedFormat: 'BVC-XXX-000 (X=uppercase letter, 0=digit)'
      });
    }

    // Generate baseId using same method as contract
    const baseIdBytes32 = ethers.keccak256(ethers.toUtf8Bytes(id));
    logger('getVulnerabilityVersions', 'info', 'Generated bytes32 base ID', { 
      textId: id, 
      bytes32Id: baseIdBytes32 
    });

    try {
      // Get vulnerability versions from contract
      logger('getVulnerabilityVersions', 'info', 'Fetching version history', { id });
      const versionIds = await contract.getVulnerabilityVersions(baseIdBytes32);
      
      logger('getVulnerabilityVersions', 'info', `Retrieved ${versionIds.length} versions`, { id });
      
      // Fetch details for each version
      const versions = [];
      for (let i = 0; i < versionIds.length; i++) {
        const versionId = versionIds[i];
        const versionNumber = i + 1; // Versions are 1-indexed
        
        logger('getVulnerabilityVersions', 'info', `Fetching version ${versionNumber} details`, { 
          id, 
          versionId 
        });
        
        try {
          const versionData = await contract.getVulnerabilityByVersion(baseIdBytes32, versionNumber);
          const [vulnId, version, vulnBaseId, title, description, ipfsCid, platform, isActive] = versionData;
          
          versions.push({
            versionId: vulnId,
            version: version.toString(),
            title,
            description,
            ipfsCid,
            platform,
            isActive,
            ipfsUrl: ipfsCid ? `https://gateway.pinata.cloud/ipfs/${ipfsCid}` : null
          });
          
          logger('getVulnerabilityVersions', 'info', `Retrieved version ${versionNumber} details`, { id });
        } catch (error) {
          logger('getVulnerabilityVersions', 'error', `Failed to fetch version ${versionNumber}`, {
            id,
            error: error.message
          });
        }
      }
      
      const responseData = {
        id,
        baseId: baseIdBytes32,
        versionCount: versionIds.length,
        versions
      };
      
      logger('getVulnerabilityVersions', 'success', 'Version history retrieved', { id });
      res.json(responseData);
      
    } catch (error) {
      // Handle case when vulnerability doesn't exist
      if (error.message.includes('Base vulnerability does not exist')) {
        logger('getVulnerabilityVersions', 'error', 'Vulnerability not found', { 
          id, 
          bytes32Id: baseIdBytes32 
        });
        return res.status(404).json({ 
          error: 'Vulnerability not found',
          details: `No entry for ID: ${id} (${baseIdBytes32})`
        });
      }
      
      // Handle other errors
      logger('getVulnerabilityVersions', 'error', 'Contract error', { 
        id, 
        error: error.message 
      });
      throw error;
    }
    
  } catch (error) {
    logger('getVulnerabilityVersions', 'error', 'Retrieval error', { 
      id, 
      error: error.message,
      stack: error.stack 
    });
    
    res.status(500).json({
      error: 'Failed to retrieve vulnerability versions',
      details: error.message
    });
  }
});

// Add endpoint to get specific version of a vulnerability
app.get('/getVulnerabilityByVersion/:id/:version', async (req, res) => {
  const { id, version } = req.params;
  logger('getVulnerabilityByVersion', 'info', 'Request received', { id, version });
  
  try {
    // Validate ID format
    if (!/^BVC-[A-Z]{3}-\d{3}$/.test(id)) {
      logger('getVulnerabilityByVersion', 'error', 'Invalid ID format', { id });
      return res.status(400).json({
        error: 'Invalid ID format',
        expectedFormat: 'BVC-XXX-000 (X=uppercase letter, 0=digit)'
      });
    }

    // Validate version is a positive integer
    const versionNum = parseInt(version);
    if (isNaN(versionNum) || versionNum <= 0) {
      logger('getVulnerabilityByVersion', 'error', 'Invalid version format', { version });
      return res.status(400).json({
        error: 'Invalid version format',
        details: 'Version must be a positive integer'
      });
    }

    // Generate baseId using same method as contract
    const baseIdBytes32 = ethers.keccak256(ethers.toUtf8Bytes(id));
    logger('getVulnerabilityByVersion', 'info', 'Generated bytes32 base ID', { 
      textId: id, 
      bytes32Id: baseIdBytes32,
      version: versionNum
    });

    try {
      // Get vulnerability details from contract using getVulnerabilityByVersion
      logger('getVulnerabilityByVersion', 'info', 'Fetching from blockchain', { id, version: versionNum });
      const vulnerability = await contract.getVulnerabilityByVersion(baseIdBytes32, versionNum);

      // Destructure the vulnerability data
      const [
        vulnId,
        vulnVersion,
        vulnBaseId,
        title,
        description,
        ipfsCid,
        platform,
        isActive
      ] = vulnerability;

      // Log successful retrieval
      logger('getVulnerabilityByVersion', 'info', 'Vulnerability version found on blockchain', { 
        id,
        version: versionNum,
        title,
        platform,
        ipfsCid
      });

      // Retrieve IPFS metadata if available
      let ipfsData = null;
      if (ipfsCid) {
        try {
          logger('getVulnerabilityByVersion', 'info', 'Fetching IPFS metadata', { 
            id, 
            version: versionNum,
            cid: ipfsCid 
          });
          
          const response = await axios.get(
            `https://gateway.pinata.cloud/ipfs/${ipfsCid}`,
            { timeout: 3000 }
          );
          ipfsData = response.data;
          logger('getVulnerabilityByVersion', 'info', 'IPFS metadata retrieved', { id, version: versionNum });
        } catch (ipfsError) {
          logger('getVulnerabilityByVersion', 'warn', 'IPFS fetch failed', { 
            id, 
            version: versionNum,
            cid: ipfsCid,
            error: ipfsError.message 
          });
        }
      }

      // Format comprehensive response
      const responseData = {
        id: id,
        bytes32BaseId: vulnBaseId,
        bytes32VersionId: vulnId,
        title,
        description,
        platform,
        version: vulnVersion.toString(),
        status: isActive ? 'active' : 'inactive',
        ipfs: {
          cid: ipfsCid,
          data: ipfsData,
          url: ipfsCid ? `https://gateway.pinata.cloud/ipfs/${ipfsCid}` : null
        },
        blockchain: {
          contract: contractAddress,
          network: await provider.getNetwork()
        }
      };
      
      logger('getVulnerabilityByVersion', 'success', 'Vulnerability version data retrieved', { 
        id, 
        version: versionNum 
      });
      res.json(responseData);

    } catch (error) {
      // Handle case when version doesn't exist
      if (error.message.includes('Version does not exist')) {
        logger('getVulnerabilityByVersion', 'error', 'Vulnerability version not found', { 
          id, 
          version: versionNum,
          bytes32Id: baseIdBytes32 
        });
        return res.status(404).json({ 
          error: 'Vulnerability version not found',
          details: `No version ${versionNum} for ID: ${id} (${baseIdBytes32})`
        });
      }
      
      // Handle case when base vulnerability doesn't exist
      if (error.message.includes('Vulnerability does not exist')) {
        logger('getVulnerabilityByVersion', 'error', 'Base vulnerability not found', { 
          id, 
          bytes32Id: baseIdBytes32 
        });
        return res.status(404).json({ 
          error: 'Vulnerability not found',
          details: `No entry for ID: ${id} (${baseIdBytes32})`
        });
      }
      
      // Handle general contract errors
      if (error.code === 'CALL_EXCEPTION') {
        logger('getVulnerabilityByVersion', 'error', 'Contract revert error', { 
          id, 
          version: versionNum,
          bytes32Id: baseIdBytes32, 
          code: error.code 
        });
        return res.status(404).json({ 
          error: 'Vulnerability version not found',
          details: `Contract reverted for ID: ${id}, version: ${versionNum}`
        });
      }

      // Rethrow unexpected errors
      logger('getVulnerabilityByVersion', 'error', 'Unexpected contract error', { 
        id, 
        version: versionNum,
        error: error.message 
      });
      throw error;
    }

  } catch (error) {
    logger('getVulnerabilityByVersion', 'error', 'Retrieval error', { 
      id, 
      version,
      error: error.message,
      stack: error.stack 
    });
    
    res.status(500).json({
      error: 'Failed to retrieve vulnerability version',
      details: error.message,
      debugInfo: {
        contractAddress,
        rpcUrl: process.env.POLYGON_ZKEVM_RPC_URL
      }
    });
  }
});

// Add endpoint to get all vulnerability IDs
app.get('/getAllVulnerabilityIds', async (req, res) => {
  logger('getAllVulnerabilityIds', 'info', 'Request received');
  
  try {
    // Fetch all vulnerability base IDs from the smart contract
    logger('getAllVulnerabilityIds', 'info', 'Fetching all vulnerability IDs from contract');
    const allIds = await contract.getAllBaseVulnerabilityIds();
    logger('getAllVulnerabilityIds', 'info', `Retrieved ${allIds.length} vulnerability IDs`);
    
    // Convert bytes32 IDs to readable format if possible
    const formattedIds = [];
    for (const id of allIds) {
      try {
        // Check if we have any existing vulnerabilities to extract text ID
        const latestId = await contract.latestVersions(id);
        const vulnerability = await contract.vulnerabilities(latestId);
        
        // Try to find any IPFS metadata with the original text ID
        let textId = null;
        if (vulnerability.ipfsCid) {
          try {
            const ipfsResponse = await axios.get(
              `https://gateway.pinata.cloud/ipfs/${vulnerability.ipfsCid}`,
              { timeout: 2000 }
            );
            if (ipfsResponse.data && ipfsResponse.data.id) {
              textId = ipfsResponse.data.id;
            }
          } catch (ipfsError) {
            // Continue without IPFS data
          }
        }
        
        formattedIds.push({
          bytes32Id: id,
          textId: textId,
          latestVersionId: latestId
        });
      } catch (error) {
        // Just include the bytes32 ID if we can't get additional info
        formattedIds.push({
          bytes32Id: id,
          textId: null,
          latestVersionId: null
        });
      }
    }
    
    logger('getAllVulnerabilityIds', 'success', 'Successfully retrieved vulnerability IDs');
    res.json({
      count: allIds.length,
      ids: formattedIds
    });
    
  } catch (error) {
    logger('getAllVulnerabilityIds', 'error', 'Error fetching vulnerability IDs', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'Failed to retrieve vulnerability IDs',
      details: error.message
    });
  }
});

// Add endpoint for paginated vulnerability IDs
app.get('/getPaginatedVulnerabilityIds', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;
  
  logger('getPaginatedVulnerabilityIds', 'info', 'Request received', { page, pageSize });
  
  try {
    // Validate pagination parameters
    if (page < 1 || pageSize < 1) {
      logger('getPaginatedVulnerabilityIds', 'error', 'Invalid pagination parameters', { page, pageSize });
      return res.status(400).json({
        error: 'Invalid pagination parameters',
        details: 'Page and pageSize must be positive integers'
      });
    }
    
    // Fetch paginated vulnerability IDs from the smart contract
    logger('getPaginatedVulnerabilityIds', 'info', 'Fetching paginated vulnerability IDs', { page, pageSize });
    const paginatedIds = await contract.getPaginatedBaseVulnerabilityIds(page, pageSize);
    logger('getPaginatedVulnerabilityIds', 'info', `Retrieved ${paginatedIds.length} vulnerability IDs for page ${page}`);
    
    // Get total count of IDs
    const allIds = await contract.getAllBaseVulnerabilityIds();
    const totalCount = allIds.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    
    // Convert bytes32 IDs to readable format if possible
    const formattedIds = [];
    for (const id of paginatedIds) {
      try {
        // Check if we have any existing vulnerabilities to extract text ID
        const latestId = await contract.latestVersions(id);
        const vulnerability = await contract.vulnerabilities(latestId);
        
        // Try to find any IPFS metadata with the original text ID
        let textId = null;
        if (vulnerability.ipfsCid) {
          try {
            const ipfsResponse = await axios.get(
              `https://gateway.pinata.cloud/ipfs/${vulnerability.ipfsCid}`,
              { timeout: 2000 }
            );
            if (ipfsResponse.data && ipfsResponse.data.id) {
              textId = ipfsResponse.data.id;
            }
          } catch (ipfsError) {
            // Continue without IPFS data
          }
        }
        
        formattedIds.push({
          bytes32Id: id,
          textId: textId,
          latestVersionId: latestId
        });
      } catch (error) {
        // Just include the bytes32 ID if we can't get additional info
        formattedIds.push({
          bytes32Id: id,
          textId: null,
          latestVersionId: null
        });
      }
    }
    
    logger('getPaginatedVulnerabilityIds', 'success', 'Successfully retrieved paginated vulnerability IDs');
    res.json({
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      ids: formattedIds
    });
    
  } catch (error) {
    logger('getPaginatedVulnerabilityIds', 'error', 'Error fetching paginated vulnerability IDs', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'Failed to retrieve paginated vulnerability IDs',
      details: error.message
    });
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

    // Check contract access with the new method name
    logger('health', 'info', 'Checking contract accessibility');
    await contract.getAllBaseVulnerabilityIds();
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
// Set Vulnerability Status Endpoint
// ───────────────────────────────────────────────────────────────────────────────
app.post('/setVulnerabilityStatus', async (req, res) => {
  logger('setVulnerabilityStatus', 'info', 'Request received', req.body);
  
  try {
    // Validate request parameters
    if (!req.body.id || req.body.isActive === undefined) {
      logger('setVulnerabilityStatus', 'error', 'Missing required parameters');
      return res.status(400).json({ 
        error: 'Both id and isActive parameters are required' 
      });
    }
    
    const { id, isActive } = req.body;
    
    // Validate ID format if it's in text format
    if (typeof id === 'string' && id.startsWith('BVC-') && !/^BVC-[A-Z]{3}-\d{3}$/.test(id)) {
      logger('setVulnerabilityStatus', 'error', 'Invalid ID format', { id });
      return res.status(400).json({
        error: 'Invalid ID format',
        expectedFormat: 'BVC-XXX-000 (X=uppercase letter, 0=digit)'
      });
    }
    
    // Generate or use provided baseId
    let baseIdBytes32;
    if (typeof id === 'string' && id.startsWith('BVC-')) {
      baseIdBytes32 = ethers.keccak256(ethers.toUtf8Bytes(id));
      logger('setVulnerabilityStatus', 'info', 'Generated bytes32 base ID', { 
        textId: id, 
        bytes32Id: baseIdBytes32 
      });
    } else if (id.startsWith('0x') && id.length === 66) {
      // ID is already in bytes32 format
      baseIdBytes32 = id;
      logger('setVulnerabilityStatus', 'info', 'Using provided bytes32 base ID', { 
        bytes32Id: baseIdBytes32 
      });
    } else {
      logger('setVulnerabilityStatus', 'error', 'Invalid ID format', { id });
      return res.status(400).json({
        error: 'Invalid ID format',
        details: 'ID must be either a BVC-XXX-000 format or a bytes32 hex string'
      });
    }
    
    // Set vulnerability status
    logger('setVulnerabilityStatus', 'info', 'Setting vulnerability status', {
      baseId: baseIdBytes32,
      isActive
    });
    
    const tx = await contract.setVulnerabilityStatus(baseIdBytes32, isActive);
    logger('setVulnerabilityStatus', 'info', 'Transaction submitted', { txHash: tx.hash });
    
    // Wait for confirmation
    const receipt = await tx.wait();
    logger('setVulnerabilityStatus', 'info', 'Transaction confirmed', { 
      txHash: tx.hash,
      blockNumber: receipt.blockNumber 
    });
    
    res.json({
      message: `Vulnerability status updated to ${isActive ? 'active' : 'inactive'}`,
      baseId: baseIdBytes32,
      isActive,
      blockchain: {
        txHash: tx.hash,
        block: receipt.blockNumber,
        contract: contractAddress
      }
    });
    
  } catch (error) {
    logger('setVulnerabilityStatus', 'error', 'Error setting vulnerability status', {
      error: error.message,
      stack: error.stack
    });
    
    // Check for specific error message from contract
    if (error.message.includes('Vulnerability does not exist')) {
      return res.status(404).json({
        error: 'Vulnerability not found',
        details: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to set vulnerability status',
      details: error.message
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
