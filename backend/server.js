// Load environment variables from .env file
require('dotenv').config();

const fs = require('fs');
const { ethers } = require('ethers'); // Use ethers.js for account and transaction handling
const winston = require('winston');
const expressWinston = require('express-winston');
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const { body, validationResult } = require('express-validator');
const { abi } = require('./BVCRegistryABI.json'); // Adjust path if needed

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
// Validate Environment Variables
// ───────────────────────────────────────────────────────────────────────────────
const requiredEnvVars = [
  'PINATA_JWT',
  'POLYGON_AMOY_RPC_URL',
  'PRIVATE_KEY'
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
const contractAddress = '0xe9f81478C31ab7D28AE3B6FbAe6356ACcCE9b0d7'; // Replace with your deployed contract address
const contract = new ethers.Contract(contractAddress, abi, wallet);

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

// ───────────────────────────────────────────────────────────────────────────────
// Routes
// ───────────────────────────────────────────────────────────────────────────────
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
      const parsedMetadata = JSON.parse(metadata);
      const cid = await uploadToIPFS(parsedMetadata);

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
async function uploadToIPFS(jsonData) {
  const formData = new FormData();
  formData.append('file', Buffer.from(JSON.stringify(jsonData)), { filename: 'metadata.json' });
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