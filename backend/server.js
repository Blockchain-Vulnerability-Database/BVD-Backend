const express = require('express');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const Web3 = require('web3');
const axios = require('axios');
const FormData = require('form-data');

dotenv.config();

const app = express();
const port = 5000;

// Middleware
app.use(bodyParser.json());

// Web3 setup
const web3 = new Web3(new Web3.providers.HttpProvider(process.env.POLYGON_AMOY_RPC_URL));
const contractAddress = '0xe9f81478C31ab7D28AE3B6FbAe6356ACcCE9b0d7'; // Replace with your deployed contract address
const contractABI = require('./BVCRegistryABI.json'); // Your contract ABI file
const contract = new web3.eth.Contract(contractABI, contractAddress);

// Route to add a vulnerability
app.post('/addVulnerability', async (req, res) => {
    const { id, title, description, metadata } = req.body;

    try {
        // Step 1: Upload metadata to IPFS (Pinata or NFT.Storage)
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
        res.status(500).json({ error: error.message });
    }
});

// Route to get a vulnerability
app.get('/getVulnerability/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const vulnerability = await contract.methods.getVulnerability(id).call();
        res.json(vulnerability);
    } catch (error) {
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

app.listen(port, () => {
    console.log(`Backend server running on port ${port}`);
});