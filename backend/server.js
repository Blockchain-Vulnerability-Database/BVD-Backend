// Load environment variables from .env file
require('dotenv').config();

// Import Web3 (adjusted for web3@4.x)
const { Web3 } = require('web3');

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
    console.error("Error: Missing environment variables.");
    console.error("Missing variables:", missingEnvVars.join(', '));
    process.exit(1); // Exit if any critical environment variable is missing
}

// Initialize Web3 instance
let web3;
try {
    const rpcUrl = process.env.POLYGON_AMOY_RPC_URL;
    web3 = new Web3(rpcUrl);
    console.log("Web3 initialized successfully.");
} catch (error) {
    console.error("Error initializing Web3:", error.message);
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

        res.json({
            status: 'success',
            isListening,
            networkType,
            blockNumber
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Route to add a vulnerability
app.post('/addVulnerability', async (req, res) => {
    const { id, title, description, metadata } = req.body;

    try {
        if (!id || !title || !description || !metadata) {
            return res.status(400).json({ error: "Missing required fields." });
        }

        // Step 1: Upload metadata to IPFS
        const cid = await uploadToIPFS(metadata);

        // Step 2: Add vulnerability data to the contract
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

        res.json({ message: 'Vulnerability added successfully', receipt });
    } catch (error) {
        console.error('Error adding vulnerability:', error);
        res.status(500).json({ error: error.message });
    }
});

// Route to get a vulnerability
app.get('/getVulnerability/:id', async (req, res) => {
    const { id } = req.params;

    try {
        if (!id) {
            return res.status(400).json({ error: "Missing vulnerability ID." });
        }

        const vulnerability = await contract.methods.getVulnerability(id).call();

        if (!vulnerability) {
            return res.status(404).json({ error: "Vulnerability not found." });
        }

        res.json(vulnerability);
    } catch (error) {
        console.error('Error fetching vulnerability:', error);
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
    console.log(`Server running on http://localhost:${PORT}`);
});