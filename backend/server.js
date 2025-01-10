// Load environment variables from .env file
require('dotenv').config();

// Import Web3 (adjusted for web3@4.x)
const { Web3 } = require('web3');
const winston = require('winston');

// Set up Winston logger
const logger = winston.createLogger({
  level: 'info', // The default logging level
  format: winston.format.combine(
    winston.format.colorize(), // Colorize logs in the console
    winston.format.timestamp(), // Add a timestamp to logs
    winston.format.simple() // Simplified log format
  ),
  transports: [
    new winston.transports.Console(), // Log to console
    new winston.transports.File({ filename: 'logs/app.log' }) // Log to file
  ]
});

// Validate and initialize the RPC URL
const requiredEnvVars = [
    "POLYGON_AMOY_RPC_URL", 
    "PRIVATE_KEY", 
    "PINATA_API_KEY", 
    "PINATA_SECRET_KEY"
];

const missingEnvVars = [];

requiredEnvVars.forEach((envVar) => {
    if (!process.env[envVar]) {
        missingEnvVars.push(envVar);
    }
});

if (missingEnvVars.length > 0) {
    logger.error("Missing environment variables.");
    logger.error("Missing variables:", missingEnvVars.join(', '));
    process.exit(1); // Exit if any critical environment variable is missing
}

// Initialize Web3 instance
let web3;
try {
    const rpcUrl = process.env.POLYGON_AMOY_RPC_URL;
    web3 = new Web3(rpcUrl);
    logger.info("Web3 initialized successfully.");
} catch (error) {
    logger.error("Error initializing Web3:", error.message);
    process.exit(1); // Exit on initialization error
}

// Express server setup
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const app = express();

app.use(express.json());

// Sample route to check Web3 connection
app.get('/status', async (req, res) => {
    try {
        const isListening = await web3.eth.net.isListening();
        const networkType = await web3.eth.net.getNetworkType();
        const blockNumber = await web3.eth.getBlockNumber();

        logger.info(`Status check successful: Listening=${isListening}, Network=${networkType}, Block=${blockNumber}`);

        res.json({
            status: 'success',
            isListening,
            networkType,
            blockNumber
        });
    } catch (error) {
        logger.error("Error during status check:", error.message);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Route to add a vulnerability
app.post('/addVulnerability', async (req, res) => {
    const { id, title, description, metadata } = req.body;

    try {
        if (!id || !title || !description || !metadata) {
            logger.warn("Missing required fields in request:", { id, title, description });
            return res.status(400).json({ error: "Missing required fields." });
        }

        logger.info("Uploading metadata to IPFS...");
        const cid = await uploadToIPFS(metadata);

        logger.info(`Metadata uploaded successfully. CID: ${cid}`);

        // Continue with smart contract interaction
        const account = web3.eth.accounts.privateKeyToAccount(process.env.PRIVATE_KEY);
        const data = contract.methods.addVulnerability(id, title, description, cid).encodeABI();

        const tx = {
            from: account.address,
            to: contractAddress,
            gas: 2000000,
            data,
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, process.env.PRIVATE_KEY);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        logger.info("Transaction receipt:", receipt);

        res.json({ message: 'Vulnerability added successfully', receipt });
    } catch (error) {
        logger.error('Error adding vulnerability:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Route to get a vulnerability
app.get('/getVulnerability/:id', async (req, res) => {
    const { id } = req.params;

    try {
        if (!id) {
            logger.warn("Missing vulnerability ID.");
            return res.status(400).json({ error: "Missing vulnerability ID." });
        }

        const vulnerability = await contract.methods.getVulnerability(id).call();

        if (!vulnerability) {
            logger.warn("Vulnerability not found:", id);
            return res.status(404).json({ error: "Vulnerability not found." });
        }

        res.json(vulnerability);
    } catch (error) {
        logger.error('Error fetching vulnerability:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Function to upload metadata to IPFS using Pinata
async function uploadToIPFS(metadata) {
    const formData = new FormData();
    formData.append('file', metadata);

    const response = await axios.post(
        'https://api.pinata.cloud/pinning/pinFileToIPFS',
        formData,
        {
            headers: {
                'pinata_api_key': process.env.PINATA_API_KEY,
                'pinata_secret_api_key': process.env.PINATA_SECRET_KEY,
            },
        }
    );
    return response.data.IpfsHash;
}

// Port configuration
const PORT = process.env.PORT || 3000;

// Start the server
app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
});