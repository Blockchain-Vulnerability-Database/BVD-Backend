// Load environment variables from .env file
require('dotenv').config();

const fs = require('fs');
const { ethers, ZeroHash, toUtf8String } = require('ethers');
const winston = require('winston');
const expressWinston = require('express-winston');
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const crypto = require('crypto');
const { body, validationResult, query } = require('express-validator');

// ───────────────────────────────────────────────────────────────────────────────
// Logger Setup
// ───────────────────────────────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => `${timestamp} [${level}]: ${message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/app.log' })
  ],
});

module.exports = logger; // Export logger for use throughout your application

// ───────────────────────────────────────────────────────────────────────────────
// Load ABI from Environment Variable
// ───────────────────────────────────────────────────────────────────────────────
const abiFilePath = process.env.ABI_FILE_PATH;

if (!abiFilePath || abiFilePath.trim() === '') {
  logger.error('Error: ABI_FILE_PATH is not defined in environment variables.');
  process.exit(1);
}

let abi;
try {
  abi = require(abiFilePath).abi;
  if (!abi) {
    throw new Error('ABI not found in configuration file.');
  }
  logger.info('ABI loaded successfully from:', abiFilePath);
} catch (error) {
  logger.error('Error loading ABI file:', error.message);
  process.exit(1);
}

// ───────────────────────────────────────────────────────────────────────────────
// Validate Environment Variables
// ───────────────────────────────────────────────────────────────────────────────
const requiredEnvVars = [
  'PINATA_JWT',
  'POLYGON_AMOY_RPC_URL',
  'PRIVATE_KEY',
  'CONTRACT_ADDRESS'
];

const missingEnvVars = [];
requiredEnvVars.forEach(envVar => {
  if (!process.env[envVar] || process.env[envVar].trim() === '') {
    missingEnvVars.push(envVar);
  }
});

if (missingEnvVars.length > 0) {
  logger.error('Missing environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

// ───────────────────────────────────────────────────────────────────────────────
// Initialize Ethers.js
// ───────────────────────────────────────────────────────────────────────────────
let provider, wallet;
try {
  provider = new ethers.JsonRpcProvider(process.env.POLYGON_AMOY_RPC_URL);
  logger.info('Ethers provider initialized successfully.');

  const privateKey = process.env.PRIVATE_KEY.trim();
  logger.info(`Using PRIVATE_KEY (masked): ${privateKey.slice(0, 6)}...${privateKey.slice(-4)}`);

  if (!/^([a-fA-F0-9]{64})$/.test(privateKey)) {
    throw new Error('Invalid private key format. Must be a 64-character hexadecimal string.');
  }

  wallet = new ethers.Wallet(privateKey, provider);
  logger.info(`Derived address with ethers.js: ${wallet.address}`);
} catch (error) {
  logger.error('Error initializing Ethers.js:', error.message);
  process.exit(1);
}

// ───────────────────────────────────────────────────────────────────────────────
// `parseBytes32String` Helper
// ───────────────────────────────────────────────────────────────────────────────

/** 
 * parseBytes32String - Replicates the old v5 behavior:
 *   - Convert 0x-hex to bytes
 *   - Trim trailing null (\x00) bytes
 *   - Return the UTF-8 decoded string
 */
function parseBytes32String(bytes32Data) {
  const bytes = ethers.getBytes(bytes32Data);
  let length = bytes.length;
  while (length > 0 && bytes[length - 1] === 0) {
    length--;
  }
  return toUtf8String(bytes.slice(0, length));
}

// ───────────────────────────────────────────────────────────────────────────────
// Contract Setup
// ───────────────────────────────────────────────────────────────────────────────
const contractAddress = process.env.CONTRACT_ADDRESS.trim();
if (!contractAddress) {
  logger.error('Missing CONTRACT_ADDRESS in environment variables.');
  process.exit(1);
}

const contract = new ethers.Contract(contractAddress, abi, wallet);
logger.info(`Contract initialized at address: ${contractAddress}`);

// ───────────────────────────────────────────────────────────────────────────────
// Express Setup
// ───────────────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Request/Response Logging
app.use(
  expressWinston.logger({
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({ filename: 'logs/requests.log' })
    ],
    format: winston.format.json(),
    meta: true,
    msg: 'HTTP {{req.method}} {{req.url}}',
    expressFormat: true,
    colorize: false
  })
);

// Mock database for CIDs (replace with a real DB in production)
const mockDatabase = new Set();

// ───────────────────────────────────────────────────────────────────────────────
// Routes
// ───────────────────────────────────────────────────────────────────────────────

// Status Route
app.get('/status', async (req, res) => {
  try {
    const blockNumber = await provider.getBlockNumber();
    logger.info(`Status check successful: Block=${blockNumber}`);
    res.json({ status: 'success', blockNumber });
  } catch (error) {
    logger.error('Error during status check:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ──────────── //
// Add Vulnerability Route     //
// ──────────── //
app.post(
  '/addVulnerability',
  [
    body('id')
      .isString()
      .notEmpty()
      .withMessage('id is required and must be a string')
      .matches(/^BVC-[A-Z]+-\d+$/)
      .withMessage('id must follow the naming convention: BVC-<TYPE>-<NUMBER>'),
    body('title').isString().notEmpty().withMessage('title is required and must be a string'),
    body('description').isString().notEmpty().withMessage('description is required and must be a string'),
    body('metadata').isString().notEmpty().withMessage('metadata is required and must be a string')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Validation failed:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { id, title, description, metadata } = req.body;

      // Ensure ID follows the naming convention
      if (!/^BVC-[A-Z]+-\d+$/.test(id)) {
        logger.warn(`Invalid ID naming convention: ${id}`);
        return res.status(400).json({
          error: 'Invalid ID naming convention. Must follow BVC-<TYPE>-<NUMBER> format.'
        });
      }

      // Convert ID to bytes32 using Ethers.js v6
      let idBytes32;
      try {
        idBytes32 = ethers.encodeBytes32String(id);
        logger.info(`Converted ID to bytes32: ${idBytes32}`);
      } catch (error) {
        logger.error(`Failed to convert ID to bytes32: ${error.message}`);
        return res.status(400).json({
          error: 'Invalid ID format. Must be a UTF-8 string and <= 32 bytes.'
        });
      }

      // Validate metadata file
      if (!fs.existsSync(metadata)) {
        logger.error(`Metadata file not found: ${metadata}`);
        return res.status(400).json({ error: 'Metadata file not found.' });
      }

      const fileBuffer = fs.readFileSync(metadata);
      const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      logger.info(`Metadata hash calculated: ${fileHash}`);

      if (mockDatabase.has(fileHash)) {
        logger.warn('Vulnerability already exists in IPFS.');
        return res.status(409).json({ error: 'Vulnerability already exists in IPFS.' });
      }

      // Upload metadata to IPFS
      const cid = await uploadToIPFS(fileBuffer, `${id}.json`);
      logger.info(`Uploaded metadata to IPFS. CID: ${cid}`);

      // Save file hash to mock database
      mockDatabase.add(fileHash);

      // Interact with the smart contract
      const tx = await contract.addVulnerability(idBytes32, title, description, cid);
      logger.info(`Transaction submitted. Hash: ${tx.hash}`);

      const receipt = await tx.wait();
      logger.info(`Transaction confirmed. Receipt: ${JSON.stringify(receipt)}`);

      res.json({ message: 'Vulnerability added successfully', receipt });
    } catch (error) {
      logger.error(`Error adding vulnerability: ${error.message}`);
      res.status(500).json({ status: 'error', message: error.message });
    }
  }
);

// ──────────── //
// Get Vulnerability by ID       //
// ──────────── //
app.get('/getVulnerability/:id', async (req, res) => {
  const { id } = req.params;

  try {
    logger.info(`Processing ID: ${id}`);

    // Validate the ID
    if (!/^BVC-[A-Z]+-\d+$/.test(id)) {
      logger.warn(`Invalid ID naming convention: ${id}`);
      return res.status(400).json({
        error: 'Invalid ID naming convention. Must follow BVC-<PLATFORM>-<NUMBER> format.',
      });
    }

    // Convert ID to bytes32
    let idBytes32;
    try {
      idBytes32 = ethers.encodeBytes32String(id);
      logger.info(`Converted ID to bytes32: ${idBytes32}`);
    } catch (error) {
      logger.error(`Failed to convert ID to bytes32: ${error.message}`);
      return res.status(400).json({
        error: 'Invalid ID format. Must be a UTF-8 string and <= 32 bytes.',
      });
    }

    // Fetch vulnerability details
    let vulnerability;
    try {
      vulnerability = await contract.getVulnerability(idBytes32);
    } catch (error) {
      if (error.code === 'CALL_EXCEPTION') {
        logger.error(`Smart contract revert: ${error.reason}`);
        return res.status(404).json({ error: error.reason || 'Vulnerability not found' });
      }
      logger.error(`Error fetching vulnerability: ${error.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }

    // Check if the returned vulnerability is valid
    if (!vulnerability.id || vulnerability.id === ZeroHash) {
      logger.warn('Vulnerability does not exist');
      return res.status(404).json({ error: 'Vulnerability does not exist' });
    }

    // Decode and respond
    const decodedId = parseBytes32String(vulnerability.id).replace(/\0/g, '');
    res.json({
      status: 'success',
      vulnerability: {
        id: decodedId,
        title: vulnerability.title,
        description: vulnerability.description,
        ipfsCid: vulnerability.ipfsCid,
        isActive: vulnerability.isActive,
      },
    });
  } catch (error) {
    logger.error(`Unhandled error: ${error.message}`);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ──────────── //
// Set Vulnerability Status     //
// ──────────── //
app.post(
  '/setVulnerabilityStatus',
  [
    body('id')
      .isString()
      .notEmpty()
      .withMessage('id is required and must be a string')
      .matches(/^BVC-[A-Z]+-\d+$/)
      .withMessage('id must follow the naming convention: BVC-<PLATFORM>-<NUMBER>'),
    body('isActive').isBoolean().withMessage('isActive must be a boolean value')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Validation failed:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { id, isActive } = req.body;

      // Validate naming convention
      if (!/^BVC-[A-Z]+-\d+$/.test(id)) {
        logger.warn(`Invalid ID naming convention: ${id}`);
        return res.status(400).json({
          error: 'Invalid ID naming convention. Must follow BVC-<PLATFORM>-<NUMBER> format.'
        });
      }

      // Convert ID to bytes32
      let idBytes32;
      try {
        idBytes32 = ethers.encodeBytes32String(id); // Ethers.js v6 method
        logger.info(`Converted ID to bytes32: ${idBytes32}`);
      } catch (error) {
        logger.error(`Failed to convert ID to bytes32: ${error.message}`);
        return res.status(400).json({
          error: 'Invalid ID format. Must be a UTF-8 string and <= 32 bytes.'
        });
      }

      // Interact with smart contract
      let receipt;
      try {
        const tx = await contract.setVulnerabilityStatus(idBytes32, isActive);
        logger.info(`Transaction submitted. Hash: ${tx.hash}`);
        receipt = await tx.wait();
        logger.info(`Transaction confirmed. Receipt: ${JSON.stringify(receipt)}`);
      } catch (error) {
        if (error.code === 'CALL_EXCEPTION') {
          logger.error(`Smart contract revert: ${error.reason}`);
          return res.status(400).json({ error: error.reason || 'Smart contract execution failed' });
        }
        logger.error(`Error interacting with smart contract: ${error.message}`);
        return res.status(500).json({ error: 'Internal server error' });
      }

      // Success response
      res.json({
        message: 'Vulnerability status updated successfully',
        receipt
      });
    } catch (error) {
      logger.error(`Unhandled error: ${error.message}`);
      res.status(500).json({ status: 'error', message: error.message });
    }
  }
);

// ───────────── //
// Get All Vulnerabilities Route  //
// ───────────── //
app.get('/getAllVulnerabilities', async (req, res) => {
  try {
    // Fetch all vulnerability IDs
    let ids;
    try {
      ids = await contract.getAllVulnerabilityIds();
      logger.info(`Fetched ${ids.length} vulnerabilities`);
    } catch (error) {
      logger.error(`Error fetching IDs from contract: ${error.message}`);
      return res.status(500).json({ error: 'Failed to retrieve vulnerabilities from the contract' });
    }

    // Fetch details for each vulnerability
    const vulnerabilities = [];
    for (const id of ids) {
      try {
        const vuln = await contract.getVulnerability(id);
        vulnerabilities.push({
          id: parseBytes32String(id).replace(/\0/g, ''), // Trim null characters
          title: vuln.title,
          description: vuln.description,
          ipfsCid: vuln.ipfsCid,
          isActive: vuln.isActive,
        });
      } catch (error) {
        logger.error(`Error fetching details for ID: ${id}. Message: ${error.message}`);
        vulnerabilities.push({
          id: parseBytes32String(id).replace(/\0/g, ''),
          error: 'Failed to fetch details for this vulnerability',
        });
      }
    }

    res.json({ status: 'success', vulnerabilities });
  } catch (error) {
    logger.error(`Unhandled error in /getAllVulnerabilities: ${error.message}`);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ───────────────── //
// Get Paginated Vulnerabilities Route   //
// ───────────────── //
app.get(
  '/getVulnerabilitiesPaginated',
  [
    query('page').isInt({ gt: 0 }).withMessage('Page must be a positive integer'),
    query('pageSize').isInt({ gt: 0 }).withMessage('Page size must be a positive integer'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Validation failed:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { page, pageSize } = req.query;

    try {
      // Fetch paginated IDs
      let ids;
      try {
        ids = await contract.getPaginatedVulnerabilityIds(page, pageSize);
        logger.info(`Fetched ${ids.length} vulnerabilities for page ${page} with size ${pageSize}`);
      } catch (error) {
        logger.error(`Error fetching paginated IDs: ${error.message}`);
        return res.status(500).json({ error: 'Failed to retrieve paginated vulnerabilities' });
      }

      // Fetch details for each vulnerability
      const vulnerabilities = [];
      for (const id of ids) {
        try {
          const vuln = await contract.getVulnerability(id);
          vulnerabilities.push({
            id: parseBytes32String(id).replace(/\0/g, ''), // Trim null characters
            title: vuln.title,
            description: vuln.description,
            ipfsCid: vuln.ipfsCid,
            isActive: vuln.isActive,
          });
        } catch (error) {
          logger.error(`Error fetching details for ID: ${id}. Message: ${error.message}`);
          vulnerabilities.push({
            id: parseBytes32String(id).replace(/\0/g, ''),
            error: 'Failed to fetch details for this vulnerability',
          });
        }
      }

      res.json({ status: 'success', vulnerabilities });
    } catch (error) {
      logger.error(`Unhandled error in /getVulnerabilitiesPaginated: ${error.message}`);
      res.status(500).json({ status: 'error', message: error.message });
    }
  }
);

// ───────────────────────────────────────────────────────────────────────────────
// IPFS Functions
// ───────────────────────────────────────────────────────────────────────────────
async function uploadToIPFS(fileBuffer, filename) {
  const formData = new FormData();
  formData.append('file', fileBuffer, { filename });
  formData.append('pinataMetadata', JSON.stringify({ name: filename }));
  formData.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

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
    logger.info(`Pinata upload successful. CID: ${response.data.IpfsHash}`);
    return response.data.IpfsHash;
  } catch (error) {
    logger.error('Error uploading to IPFS:', error.message);
    throw new Error('Error uploading to IPFS');
  }
}

// Retrieve file contents from IPFS
app.get('/getFileContentsFromIPFS/:cid', async (req, res) => {
  const { cid } = req.params;
  // We'll guess JSON in this example; adjust as needed.
  const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${cid}`;

  try {
    //    `responseType: 'arraybuffer'` to get raw binary data.
    const response = await axios.get(gatewayUrl, { responseType: 'arraybuffer' });
    const fileBuffer = Buffer.from(response.data);

    // If you know it’s JSON, parse it. If it’s not always JSON, handle conditionally.
    // Let's assume it's JSON:
    const fileString = fileBuffer.toString('utf-8');
    const parsedJson = JSON.parse(fileString);

    res.setHeader('Content-Type', 'application/json');
    return res.send(parsedJson);

  } catch (error) {
    logger.error(`Error fetching file for CID ${cid}: ${error.message}`);
    return res.status(500).json({
      status: 'error',
      message: `Could not retrieve file from IPFS for CID: ${cid}`
    });
  }
});

// Delete File from IPFS If Not in Contract
app.delete('/deleteFileFromIPFSIfUnreferenced/:cid', async (req, res) => {
  const { cid } = req.params;

  try {
    const allIds = await contract.getAllVulnerabilityIds();

    const cidsInUse = new Set();
    for (const idBytes32 of allIds) {
      const vuln = await contract.getVulnerability(idBytes32);
      if (vuln.ipfsCid) {
        cidsInUse.add(vuln.ipfsCid);
      }
    }

    if (!cidsInUse.has(cid)) {
      await unpinFromIPFS(cid);
      return res.json({
        status: 'success',
        message: `CID ${cid} was not in the contract and has been unpinned.`,
      });
    } else {
      return res.status(400).json({
        status: 'error',
        message: `CID ${cid} is still referenced in the contract.`,
      });
    }
  } catch (error) {
    logger.error(`Error deleting from IPFS: ${error.message}`);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// GET /getHashAndCid/:id
app.get('/getHashAndCid/:id', async (req, res) => {
  const { id } = req.params;

  try {
    let idBytes32;
    try {
      idBytes32 = ethers.utils.formatBytes32String(id);
    } catch (error) {
      const buffer = Buffer.alloc(32, 0);
      buffer.write(id);
      idBytes32 = '0x' + buffer.toString('hex');
    }
    const vulnerability = await contract.getVulnerability(idBytes32);
    if (!vulnerability.id || vulnerability.id === ZeroHash) {
      return res.status(404).json({ status: 'error', message: `Vulnerability ${id} not found` });
    }
    const cid = vulnerability.ipfsCid;
    if (!cid) {
      return res.status(404).json({ status: 'error', message: `No CID found for ID ${id}` });
    }

    const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${cid}`;
    const fileResponse = await axios.get(gatewayUrl, { responseType: 'arraybuffer' });

    const fileBuffer = Buffer.from(fileResponse.data);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    return res.json({
      status: 'success',
      data: {
        id,
        cid,
        fileHash,
      },
    });
  } catch (error) {
    logger.error(`Error fetching IPFS file for ID=${id}: ${error.message}`);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

// Unpin from IPFS Helper
async function unpinFromIPFS(cid) {
  try {
    const response = await axios.delete(
      `https://api.pinata.cloud/pinning/unpin/${cid}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PINATA_JWT}`,
        },
      }
    );
    logger.info(`Unpinned ${cid} from Pinata successfully.`);
    return response.data;
  } catch (error) {
    logger.error(`Error unpinning CID ${cid}: ${error.message}`);
    throw error;
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Start the Server
// ───────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});