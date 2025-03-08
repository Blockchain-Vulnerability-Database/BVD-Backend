
# BVD-Backend

This repository contains the backend API for the **Blockchain Vulnerability Database (BVD)** project. The backend is responsible for handling metadata submissions, interacting with IPFS, and interacting with the BVCRegistry smart contract.

---

## **Directory Structure**

```plaintext
/
├── config/
│   └── index.js           # Configuration loading
├── services/
│   ├── blockchain.js      # Blockchain connection and contract interactions
│   ├── ipfs.js            # IPFS upload functionality
│   └── logger.js          # Logging service
├── routes/
│   ├── index.js           # Route registration
│   ├── vulnerabilities.js # Vulnerability-related routes
│   └── health.js          # Health check route
├── middlewares/
│   └── logging.js         # Request logging middleware
├── utils/
│   └── helpers.js         # Utility functions
├── .env                   # Environment variables
├── package.json           # Project dependencies
└── server.js              # Main application entry point
```