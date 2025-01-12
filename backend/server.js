// Load environment variables from .env file
require('dotenv').config();

const fs = require('fs');
const { ethers } = require('ethers');
const winston = require('winston');
const expressWinston = require('express-winston');
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const { body, validationResult } = require('express-validator');

// ───────────────────────────────────────────────────────────────────────────────
// Load ABI from Configuration File
// ───────────────────────────────────────────────────────────────────────────────
const abiFilePath = '/Users/dcurtis/Git/BVD/BVD-Backend/backend/BVCRegistryABI.json';
let abi;

try {
  abi = require(abiFilePath).abi;
  if (!abi) {
    throw new Error('ABI not found in configuration file.');
  }
  console.log('ABI loaded successfully from:', abiFilePath);
} catch (error) {
  console.error('Error loading ABI file:', error.message);
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
  console.error('Missing environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

// ───────────────────────────────────────────────────────────────────────────────
// Initialize Ethers.js
// ───────────────────────────────────────────────────────────────────────────────
let provider, wallet;
try {
  provider = new ethers.JsonRpcProvider(process.env.POLYGON_AMOY_RPC_URL);
  console.log('Ethers provider initialized successfully.');

  const privateKey = process.env.PRIVATE_KEY.trim();
  console.log(`Using PRIVATE_KEY (masked): ${privateKey.slice(0, 6)}...${privateKey.slice(-4)}`);

  if (!/^([a-fA-F0-9]{64})$/.test(privateKey)) {
    throw new Error('Invalid private key format. Must be a 64-character hexadecimal string.');
  }

  wallet = new ethers.Wallet(privateKey, provider);
  console.log(`Derived address with ethers.js: ${wallet.address}`);
} catch (error) {
  console.error('Error initializing Ethers.js:', error.message);
  process.exit(1);
}

// ───────────────────────────────────────────────────────────────────────────────
// Contract Setup
// ───────────────────────────────────────────────────────────────────────────────
const contractAddress = process.env.CONTRACT_ADDRESS.trim();
if (!contractAddress) {
  console.error('Missing CONTRACT_ADDRESS in environment variables.');
  process.exit(1);
}

const contract = new ethers.Contract(contractAddress, abi, wallet);
console.log(`Contract initialized at address: ${contractAddress}`);

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
    console.log(`Status check successful: Block=${blockNumber}`);
    res.json({ status: 'success', blockNumber });
  } catch (error) {
    console.error('Error during status check:', error.message);
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
      console.warn('Validation failed:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { id, title, description, metadata } = req.body;

      // Handle metadata as file
      let metadataContent;
      if (fs.existsSync(metadata)) {
        console.log(`Metadata is a file path. Reading file: ${metadata}`);
        metadataContent = JSON.parse(fs.readFileSync(metadata, 'utf-8'));
      } else {
        console.warn('Metadata file not found.');
        return res.status(400).json({ error: 'Metadata file not found.' });
      }

      // Upload to IPFS
      const cid = await uploadToIPFS(metadataContent, id);

      // Interact with the smart contract
      const tx = await contract.addVulnerability(id, title, description, cid);
      console.log(`Transaction submitted. Hash: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(`Transaction confirmed. Receipt: ${JSON.stringify(receipt)}`);
      res.json({ message: 'Vulnerability added successfully', receipt });
    } catch (error) {
      console.error('Error adding vulnerability:', error.message);
      res.status(500).json({ status: 'error', message: error.message });
    }
  }
);

// ───────────────────────────────────────────────────────────────────────────────
// Upload to IPFS
// ───────────────────────────────────────────────────────────────────────────────
async function uploadToIPFS(jsonData, id) {
  const filename = `${id}.json`;
  const formData = new FormData();
  formData.append('file', Buffer.from(JSON.stringify(jsonData)), { filename });
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
    console.log(`Pinata upload successful. CID: ${response.data.IpfsHash}`);
    return response.data.IpfsHash;
  } catch (error) {
    console.error('Error uploading to IPFS:', error.message);
    throw new Error('Error uploading to IPFS');
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Start the Server
// ───────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});