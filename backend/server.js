// Load environment variables from .env file
require('dotenv').config();

const fs = require('fs');
const { Web3 } = require('web3');
const winston = require('winston');
const expressWinston = require('express-winston');
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const { body, param, validationResult } = require('express-validator');

/**
 * If Foundry's JSON includes a top-level "abi" field, destructure it here.
 * Adjust the path if `BVCRegistryABI.json` is not in the same folder.
 */
const { abi } = require('./BVCRegistryABI.json');

// ───────────────────────────────────────────────────────────────────────────────
// Winston Logger Setup
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
// Validate Required Environment Variables
// We're using the Bearer token approach with Pinata (PINATA_JWT)
// ───────────────────────────────────────────────────────────────────────────────
const requiredEnvVars = [
  'PINATA_JWT',
  'POLYGON_AMOY_RPC_URL',
  'PRIVATE_KEY'
];

const missingEnvVars = [];
requiredEnvVars.forEach((envVar) => {
  if (!process.env[envVar] || process.env[envVar].trim() === '') {
    missingEnvVars.push(envVar);
  }
});

if (missingEnvVars.length > 0) {
  logger.error('Missing environment variables.');
  logger.error('Missing variables:', missingEnvVars.join(', '));
  process.exit(1);
}

// ───────────────────────────────────────────────────────────────────────────────
// Initialize Web3
// ───────────────────────────────────────────────────────────────────────────────
let web3;
try {
  web3 = new Web3(process.env.POLYGON_AMOY_RPC_URL);
  logger.info('Web3 initialized successfully.');
} catch (error) {
  logger.error('Error initializing Web3:', error.message);
  process.exit(1);
}

// ───────────────────────────────────────────────────────────────────────────────
// Contract Setup
// Replace with your actual deployed contract address
// ───────────────────────────────────────────────────────────────────────────────
const contractAddress = '0xe9f81478C31ab7D28AE3B6FbAe6356ACcCE9b0d7';
const contract = new web3.eth.Contract(abi, contractAddress);

// ───────────────────────────────────────────────────────────────────────────────
// Express Setup
// ───────────────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// ───────────────────────────────────────────────────────────────────────────────
// Request/Response Logging via express-winston
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
// /status Route: Check Web3 Connection
// ───────────────────────────────────────────────────────────────────────────────
app.get('/status', async (req, res) => {
  try {
    const isListening = await web3.eth.net.isListening();
    const networkId = await web3.eth.net.getId();
    const blockNumber = await web3.eth.getBlockNumber();

    // Convert to string to avoid BigInt serialization issues
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
// POST /addVulnerability
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
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Validation failed:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { id, title, description, metadata } = req.body;
      logger.info('Received metadata:', metadata);

      let parsedMetadata;
      try {
        parsedMetadata = JSON.parse(metadata); // Convert string -> JSON
        logger.info('Parsed metadata:', parsedMetadata);
      } catch (parseError) {
        logger.error('Failed to parse metadata:', parseError.message);
        return res.status(400).json({ error: 'Failed to parse metadata' });
      }

      // Upload metadata to IPFS using Pinata JWT
      logger.info('Uploading metadata to IPFS...');
      const cid = await uploadToIPFS(parsedMetadata);
      logger.info(`Metadata uploaded successfully. CID: ${cid}`);

      // Prepare transaction
      const account = web3.eth.accounts.privateKeyToAccount(process.env.PRIVATE_KEY);
      const data = contract.methods.addVulnerability(id, title, description, cid).encodeABI();

      logger.info('Signing transaction...');
      const signedTx = await web3.eth.accounts.signTransaction(
        {
          from: account.address,
          to: contractAddress,
          gas: 2000000,
          data
        },
        process.env.PRIVATE_KEY
      );

      logger.info('Sending signed transaction...');
      const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

      logger.info('Transaction receipt:', receipt);
      res.json({ message: 'Vulnerability added successfully', receipt });
    } catch (error) {
      logger.error('Error adding vulnerability: FULL ERROR =>', error);
      logger.error('Error adding vulnerability: message =>', error.message);
      logger.error('Error adding vulnerability: stack =>', error.stack);

      next(error);
    }
  }
);

// ───────────────────────────────────────────────────────────────────────────────
// Upload to IPFS Using Pinata (Bearer Token) pinFileToIPFS Endpoint
// ───────────────────────────────────────────────────────────────────────────────
async function uploadToIPFS(jsonData) {
  const formData = new FormData();

  // Attach the JSON data as a file
  const buffer = Buffer.from(JSON.stringify(jsonData));
  formData.append('file', buffer, {
    filename: 'BVC-EVM-002.json',
    contentType: 'application/json',
  });

  // Add metadata for the file
  formData.append(
    'pinataMetadata',
    JSON.stringify({
      name: 'BVC-EVM-002.json',
    })
  );

  // Add pinning options
  formData.append(
    'pinataOptions',
    JSON.stringify({
      cidVersion: 1,
    })
  );

  try {
    const response = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS', // Verified URL
      formData,
      {
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: {
          Authorization: `Bearer ${process.env.PINATA_JWT}`, // Verified JWT Usage
          ...formData.getHeaders(),
        },
      }
    );

    // Log and return the CID from the response
    logger.info('Pinata upload successful:', JSON.stringify(response.data, null, 2));
    return response.data.IpfsHash;
  } catch (error) {
    // Log detailed error information
    logger.error('--- Pinata Upload Error Details ---');
    if (error.response) {
      logger.error('Pinata error status:', error.response.status);
      logger.error('Pinata error headers:', JSON.stringify(error.response.headers, null, 2));
      logger.error('Pinata error body:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      logger.error('Pinata no response:', error.request);
    } else {
      logger.error('Pinata error message:', error.message);
    }
    logger.error('--- End Pinata Upload Error Details ---');

    // Re-throw for the route's try/catch
    throw new Error('Error uploading to IPFS');
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Error-Handling Middleware
// ───────────────────────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err.stack);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      status: err.status || 500,
    },
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// Start the Server
// ───────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});