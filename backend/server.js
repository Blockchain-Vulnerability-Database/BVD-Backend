// Load environment variables from .env file
require('dotenv').config();

// Import Web3 (adjusted for web3@4.x)
const { Web3 } = require('web3');

// Validate and initialize the RPC URL
const rpcUrl = process.env.POLYGON_AMOY_RPC_URL;
if (!rpcUrl) {
    console.error("Error: POLYGON_AMOY_RPC_URL is not defined in the environment variables.");
    process.exit(1); // Exit if the URL is not defined
}

// Initialize Web3 instance
let web3;
try {
    web3 = new Web3(rpcUrl);
    console.log("Web3 initialized successfully.");
} catch (error) {
    console.error("Error initializing Web3:", error.message);
    process.exit(1); // Exit on initialization error
}

// Express server setup
const express = require('express');
const app = express();

app.use(express.json());

// Sample route to check Web3 connection
app.get('/status', async (req, res) => {
    try {
        const isListening = await web3.eth.net.isListening();
        res.json({ status: 'success', isListening });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Port configuration
const PORT = process.env.PORT || 3000;

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});