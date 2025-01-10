
# BVD-Backend

This repository contains the backend API for the **Blockchain Vulnerability Database (BVD)** project. The backend is responsible for handling metadata submissions, interacting with IPFS, and interacting with the BVCRegistry smart contract.

---

## **Directory Structure**

```plaintext
BVD-Backend/
├── controllers/               # Controllers for handling business logic
├── routes/                    # API routes for handling requests
├── server.js                  # Main backend server file
├── .env                       # Environment variables (private keys, IPFS API keys)
├── node_modules/              # Node.js dependencies
├── package.json               # Project metadata and dependencies
├── .gitignore                 # Git ignore file
├── BVCRegistryABI.json        # ABI for the BVCRegistry smart contract
└── README.md                  # This file
```

---

## **Setup and Installation**

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/BVD-Backend.git
   cd BVD-Backend
   ```

2. **Install dependencies**:
   Install the required Node.js packages by running:
   ```bash
   npm install
   ```

3. **Setup Environment Variables**:
   Create a `.env` file in the root directory with the following content:
   ```plaintext
   POLYGON_AMOY_RPC_URL=YOUR_ALCHEMY_AMOY_RPC_URL
   PRIVATE_KEY=YOUR_PRIVATE_KEY
   PINATA_API_KEY=YOUR_PINATA_API_KEY
   PINATA_SECRET_KEY=YOUR_PINATA_SECRET_KEY
   ```

4. **Start the Backend Server**:
   ```bash
   node server.js
   ```

---

## **Technologies Used**

- **Node.js**: `v18.20.5`
- **npm**: `v10.8.2`
- **Web3.js**: `v4.16.0`
- **Express**: `v4.21.2`
- **Winston**:`v3.17.0`

---

## **API Endpoints**

### `POST /addVulnerability`

Adds a new vulnerability to the blockchain and IPFS.

**Request Body:**
```json
{
  "id": "BVC-EVM-001",
  "title": "Reentrancy Attack",
  "description": "Detailed explanation of the vulnerability.",
  "metadata": "path/to/metadata.json"
}
```

**Response:**
```json
{
  "message": "Vulnerability added successfully",
  "receipt": "Transaction receipt details"
}
```

### `GET /getVulnerability/:id`

Retrieves a vulnerability by its ID from the blockchain.

**Response:**
```json
{
  "id": "BVC-EVM-001",
  "title": "Reentrancy Attack",
  "description": "Detailed explanation of the vulnerability.",
  "ipfsCid": "QmXk4...example1"
}
```

---

## **Development**

To run the backend server locally:

1. Ensure the dependencies are installed (`npm install`).
2. Start the server:
   ```bash
   node server.js
   ```
   The server will run on `http://localhost:5000`.

---

## **Contributing**

Feel free to open issues and pull requests to contribute to this project!

---

### **License**

This project is licensed under the MIT License.
