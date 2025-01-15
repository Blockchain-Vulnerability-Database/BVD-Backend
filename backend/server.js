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
// Load ABI from Environment Variable
// ───────────────────────────────────────────────────────────────────────────────
const abiFilePath = process.env.ABI_FILE_PATH;

if (!abiFilePath || abiFilePath.trim() === '') {
  console.error('Error: ABI_FILE_PATH is not defined in environment variables.');
  process.exit(1);
}

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

// Add your routes and logic here...

// ───────────────────────────────────────────────────────────────────────────────
// Start the Server
// ───────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});