// Load environment variables from .env file
require('dotenv').config();

// Import Web3 (adjusted for web3@4.x)
const { Web3 } = require('web3');
const winston = require('winston');
const expressWinston = require('express-winston');
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');

// For input validation
const { body, param, validationResult } = require('express-validator');

/**
 * Foundry's JSON includes a top-level "abi" field. We'll destructure that here.
 * 
 * IMPORTANT: Adjust the path if `BVCRegistryABI.json` is not in the same folder as this file.
 */
const { abi } = require('./BVCRegistryABI.json');

// ───────────────────────────────────────────────────────────────────────────────
// Set up Winston logger
// ───────────────────────────────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: 'info', // The default logging level
  format: winston.format.combine(
    winston.format.colorize(),  // Colorize logs in the console
    winston.format.timestamp(), // Add a timestamp to logs
    winston.format.simple()     // Simplified log format
  ),
  transports: [
    new winston.transports.Console(),                     // Log to console
    new winston.transports.File({ filename: 'logs/app.log' }) // Log to file
  ]
});

// ───────────────────────────────────────────────────────────────────────────────
// Validate and initialize the RPC URL
// ───────────────────────────────────────────────────────────────────────────────
const requiredEnvVars = [
  'POLYGON_AMOY_RPC_URL',
  'PRIVATE_KEY',
  'PINATA_API_KEY',
  'PINATA_SECRET_KEY'
];

const missingEnvVars = [];
requiredEnvVars.forEach((envVar) => {
  if (!process.env[envVar]) {
    missingEnvVars.push(envVar);
  }
});

if (missingEnvVars.length > 0) {
  logger.error('Missing environment variables.');
  logger.error('Missing variables:', missingEnvVars.join(', '));
  process.exit(1); // Exit if any critical environment variable is missing
}

// ───────────────────────────────────────────────────────────────────────────────
// Initialize Web3 instance
// ───────────────────────────────────────────────────────────────────────────────
let web3;
try {
  const rpcUrl = process.env.POLYGON_AMOY_RPC_URL;
  web3 = new Web3(rpcUrl);
  logger.info('Web3 initialized successfully.');
} catch (error) {
  logger.error('Error initializing Web3:', error.message);
  process.exit(1); // Exit on initialization error
}

// ───────────────────────────────────────────────────────────────────────────────
// Contract Setup
// Replace the address below with your actual deployed contract address.
// ───────────────────────────────────────────────────────────────────────────────
const contractAddress = '0xe9f81478C31ab7D28AE3B6FbAe6356ACcCE9b0d7'; // Your real contract address
const contract = new web3.eth.Contract(abi, contractAddress);

// ───────────────────────────────────────────────────────────────────────────────
// Express server setup
// ───────────────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// ───────────────────────────────────────────────────────────────────────────────
// Enhanced logging for HTTP requests/responses via express-winston
// ───────────────────────────────────────────────────────────────────────────────
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
// Sample route to check Web3 connection
// ───────────────────────────────────────────────────────────────────────────────
app.get('/status', async (req, res) => {
  try {
    const isListening = await web3.eth.net.isListening();

    // web3.eth.net.getId() can return a BigInt in some versions of Web3.js
    const networkId = await web3.eth.net.getId(); 
    const blockNumber = await web3.eth.getBlockNumber();

    // Convert BigInt to string (or number) to avoid "Do not know how to serialize a BigInt" errors
    const networkIdStr = networkId.toString();
    const blockNumberStr = blockNumber.toString();

    logger.info(
      `Status check successful: Listening=${isListening}, NetworkID=${networkIdStr}, Block=${blockNumberStr}`
    );

    res.json({
      status: 'success',
      isListening,
      networkId: networkIdStr,
      blockNumber: blockNumberStr
    });
  } catch (error) {
    logger.error('Error during status check:', error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// Route: Add a vulnerability (POST) with input validation
// ───────────────────────────────────────────────────────────────────────────────
app.post(
  '/addVulnerability',
  [
    body('id').isString().notEmpty().withMessage('id is required and must be a string'),
    body('title').isString().notEmpty().withMessage('title is required and must be a string'),
    body('description').isString().notEmpty().withMessage('description is required and must be a string'),
    body('metadata').isString().notEmpty().withMessage('metadata is required and must be a string')
  ],
  async (req, res, next) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Validation failed:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { id, title, description, metadata } = req.body;
      logger.info('Uploading metadata to IPFS...');
      const cid = await uploadToIPFS(metadata);
      logger.info(`Metadata uploaded successfully. CID: ${cid}`);

      // Continue with smart contract interaction
      const account = web3.eth.accounts.privateKeyToAccount(process.env.PRIVATE_KEY);
      const data = contract.methods.addVulnerability(id, title, description, cid).encodeABI();

      const tx = {
        from: account.address,
        to: contractAddress,
        gas: 2000000,
        data
      };

      const signedTx = await web3.eth.accounts.signTransaction(tx, process.env.PRIVATE_KEY);
      const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

      logger.info('Transaction receipt:', receipt);

      res.json({ message: 'Vulnerability added successfully', receipt });
    } catch (error) {
      logger.error('Error adding vulnerability:', error.message);
      next(error);
    }
  }
);

// ───────────────────────────────────────────────────────────────────────────────
// Route: Get a vulnerability (GET) with param validation
// ───────────────────────────────────────────────────────────────────────────────
app.get(
  '/getVulnerability/:id',
  [
    param('id').isString().notEmpty().withMessage('Missing or invalid vulnerability ID.')
  ],
  async (req, res, next) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Validation failed:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { id } = req.params;
      const vulnerability = await contract.methods.getVulnerability(id).call();

      // Example check: if the returned struct is empty, it might have empty strings
      // or your contract might revert or return a default struct.
      if (!vulnerability || !vulnerability.id) {
        logger.warn('Vulnerability not found:', id);
        return res.status(404).json({ error: 'Vulnerability not found.' });
      }

      res.json(vulnerability);
    } catch (error) {
      logger.error('Error fetching vulnerability:', error.message);
      next(error);
    }
  }
);

// ───────────────────────────────────────────────────────────────────────────────
// Function to upload metadata to IPFS using Pinata
// ───────────────────────────────────────────────────────────────────────────────
async function uploadToIPFS(metadata) {
  const formData = new FormData();
  formData.append('file', metadata);

  const response = await axios.post(
    'https://api.pinata.cloud/pinning/pinFileToIPFS',
    formData,
    {
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      headers: {
        'pinata_api_key': process.env.PINATA_API_KEY,
        'pinata_secret_api_key': process.env.PINATA_SECRET_KEY,
        'Content-Type': `multipart/form-data; boundary=${formData._boundary}`
      }
    }
  );

  return response.data.IpfsHash;
}

// ───────────────────────────────────────────────────────────────────────────────
// Centralized Error-Handling Middleware
// ───────────────────────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err.stack);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      status: err.status || 500
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// Port configuration + Start the server
// ───────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});