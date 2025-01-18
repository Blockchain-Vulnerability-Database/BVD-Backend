// Load environment variables from .env file
require('dotenv').config();

const fs = require('fs');
const { ethers } = require('ethers'); // Use ethers.js for account and transaction handling
const winston = require('winston');
const expressWinston = require('express-winston');
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const crypto = require('crypto'); // For SHA-256 hashing
const { body, validationResult } = require('express-validator');

// ───────────────────────────────────────────────────────────────────────────────
// Logger Setup
// ───────────────────────────────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.simple()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/app.log' })
  ]
});

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

  // Validate private key format
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
const mockDatabase = new Set(); // Store CIDs

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

// Add Vulnerability Route
app.post(
  '/addVulnerability',
  [
    body('id').isString().notEmpty().withMessage('id is required and must be a string'),
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

      // Check if the metadata file exists
      if (!fs.existsSync(metadata)) {
        throw new Error(`Metadata file not found: ${metadata}`);
      }

      // Calculate file hash
      const fileBuffer = fs.readFileSync(metadata);
      const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      logger.info(`File hash calculated: ${fileHash}`);

      // Check if the hash already exists in IPFS
      if (mockDatabase.has(fileHash)) {
        logger.warn('Vulnerability already exists in IPFS.');
        return res.status(409).json({ error: 'Vulnerability already exists in IPFS.' });
      }

      // Upload to IPFS
      const cid = await uploadToIPFS(fileBuffer);

      // Add the CID to the mock database
      mockDatabase.add(fileHash);

      // Submit the vulnerability to the blockchain
      const tx = await contract.addVulnerability(id, title, description, cid);
      logger.info(`Transaction submitted. Hash: ${tx.hash}`);

      const receipt = await tx.wait();
      logger.info(`Transaction confirmed. Receipt: ${JSON.stringify(receipt)}`);
      res.json({ message: 'Vulnerability added successfully', receipt });
    } catch (error) {
      logger.error('Error adding vulnerability:', error.message);
      res.status(500).json({ status: 'error', message: error.message });
    }
  }
);

// ───────────────────────────────────────────────────────────────────────────────
// Upload to IPFS
// ───────────────────────────────────────────────────────────────────────────────
async function uploadToIPFS(fileBuffer) {
  const formData = new FormData();
  formData.append('file', fileBuffer, { filename: 'metadata.json' });
  formData.append('pinataMetadata', JSON.stringify({ name: 'metadata.json' }));
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

// ───────────────────────────────────────────────────────────────────────────────
// Start the Server
// ───────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});