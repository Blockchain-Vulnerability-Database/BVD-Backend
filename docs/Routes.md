# Vulnerability Registry Backend

A blockchain-powered backend service for recording, tracking, and retrieving vulnerability information with IPFS integration for metadata storage.

## Table of Contents

- [Vulnerability Registry Backend](#vulnerability-registry-backend)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Project Structure](#project-structure)
  - [Configuration](#configuration)
    - [`config/index.js`](#configindexjs)
  - [Services](#services)
    - [Blockchain Service](#blockchain-service)
    - [IPFS Service](#ipfs-service)
    - [Logger Service](#logger-service)
  - [API Endpoints](#api-endpoints)
    - [Vulnerability Endpoints](#vulnerability-endpoints)
      - [POST /addVulnerability](#post-addvulnerability)
      - [GET /getVulnerability/:id](#get-getvulnerabilityid)
      - [GET /getAllVulnerabilities](#get-getallvulnerabilities)
      - [GET /getVulnerabilityVersions/:id](#get-getvulnerabilityversionsid)
      - [GET /getVulnerabilityByVersion/:id/:version](#get-getvulnerabilitybyversionidversion)
      - [GET /getAllVulnerabilityIds](#get-getallvulnerabilityids)
      - [GET /getPaginatedVulnerabilityIds](#get-getpaginatedvulnerabilityids)
      - [POST /setVulnerabilityStatus](#post-setvulnerabilitystatus)
    - [Health Endpoints](#health-endpoints)
      - [GET /health](#get-health)
  - [Middleware](#middleware)
    - [Logging Middleware](#logging-middleware)
  - [Environment Variables](#environment-variables)
  - [Getting Started](#getting-started)
  - [Error Handling](#error-handling)
  - [Logging](#logging)

## Overview

This backend application provides a REST API for interacting with a smart contract to record and retrieve vulnerability information. Each vulnerability is stored on the blockchain with additional metadata stored on IPFS. The application is built with Node.js, Express, and ethers.js for blockchain integration.

## Project Structure

```
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
├── logs/                  # Generated log files
├── .env                   # Environment variables
├── package.json           # Project dependencies
└── server.js              # Main application entry point
```

## Configuration

### `config/index.js`

Handles loading configuration from environment variables and loading the contract ABI.

**Functions:**
- N/A (Exports configuration object)

**Exported Configuration:**
- `rpcUrl`: Blockchain RPC URL
- `privateKey`: Private key for transactions
- `contractAddress`: Smart contract address
- `abiFilePath`: Path to contract ABI file
- `pinataJwt`: Pinata JWT for IPFS uploads
- `contractABI`: Parsed contract ABI
- `port`: Server port number

## Services

### Blockchain Service

**File:** `services/blockchain.js`

Provides blockchain interaction functionality using ethers.js.

**Functions:**
- `validateNetwork()`: Checks if the blockchain network is accessible
- `generateBytes32Id(textId)`: Generates a bytes32 ID from a text identifier
- `getLatestVulnerability(baseId)`: Gets the latest version of a vulnerability
- `getVulnerabilityByVersion(baseId, version)`: Gets a specific version of a vulnerability
- `getVulnerabilityVersions(baseId)`: Gets all versions for a vulnerability
- `getAllBaseVulnerabilityIds()`: Gets all vulnerability base IDs
- `getPaginatedBaseVulnerabilityIds(page, pageSize)`: Gets paginated vulnerability IDs
- `setVulnerabilityStatus(baseId, isActive)`: Sets vulnerability status
- `addVulnerability(baseId, title, description, ipfsCid, platform)`: Adds a new vulnerability

**Exported Variables:**
- `provider`: ethers.js JSON RPC provider
- `wallet`: ethers.js wallet instance
- `contract`: ethers.js contract instance

### IPFS Service

**File:** `services/ipfs.js`

Handles IPFS interactions via Pinata.

**Functions:**
- `uploadToIPFS(fileBuffer, filename)`: Uploads content to IPFS
- `fetchFromIPFS(cid, timeout = 3000)`: Fetches content from IPFS
- `checkIPFSGateway(timeout = 2000)`: Checks if Pinata gateway is available

### Logger Service

**File:** `services/logger.js`

Provides consistent logging functionality.

**Functions:**
- `logger(route, type, message, data = null)`: Logs messages with consistent format

## API Endpoints

### Vulnerability Endpoints

**File:** `routes/vulnerabilities.js`

#### POST /addVulnerability
Adds a new vulnerability record.

**Request Body:**
```json
{
  "filePath": "/path/to/vulnerability.json"
}
```

**Response:**
```json
{
  "message": "Vulnerability recorded",
  "identifiers": {
    "text": "BVC-SOL-004",
    "bytes32BaseId": "0x..."
  },
  "platform": "web",
  "blockchain": {
    "txHash": "0x...",
    "block": 123456,
    "contract": "0x..."
  },
  "ipfs": {
    "cid": "Qm...",
    "url": "https://gateway.pinata.cloud/ipfs/Qm..."
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/addVulnerability \
  -H "Content-Type: application/json" \
  -d '{"filePath": "/path/to/vulnerability.json"}'
```

#### GET /getVulnerability/:id
Gets the latest version of a vulnerability by ID.

**Parameters:**
- `id`: Vulnerability ID in BVC-XXX-000 format

**Response:**
```json
{
  "id": "BVC-SOL-004",
  "bytes32BaseId": "0x...",
  "bytes32VersionId": "0x...",
  "title": "Vulnerability Title",
  "description": "Vulnerability Description",
  "platform": "web",
  "version": "1",
  "status": "active",
  "ipfs": {
    "cid": "Qm...",
    "data": {...},
    "url": "https://gateway.pinata.cloud/ipfs/Qm..."
  },
  "blockchain": {
    "contract": "0x...",
    "network": {...}
  }
}
```

**cURL Example:**
```bash
curl -X GET http://localhost:3000/getVulnerability/BVC-SOL-004
```

#### GET /getAllVulnerabilities
Gets all vulnerabilities.

**Response:**
```json
{
  "status": "success",
  "vulnerabilities": [...]
}
```

**cURL Example:**
```bash
curl -X GET http://localhost:3000/vulnerabilities/getAllVulnerabilities
```

#### GET /getVulnerabilityVersions/:id
Gets version history for a vulnerability.

**Parameters:**
- `id`: Vulnerability ID in BVC-XXX-000 format

**Response:**
```json
{
  "id": "BVC-SOL-004",
  "baseId": "0x...",
  "versionCount": 2,
  "versions": [...]
}
```

**cURL Example:**
```bash
curl -X GET http://localhost:3000/vulnerabilities/getVulnerabilityVersions/BVC-SOL-004
```

#### GET /getVulnerabilityByVersion/:id/:version
Gets a specific version of a vulnerability.

**Parameters:**
- `id`: Vulnerability ID in BVC-XXX-000 format
- `version`: Version number

**Response:**
```json
{
  "id": "BVC-SOL-004",
  "bytes32BaseId": "0x...",
  "bytes32VersionId": "0x...",
  "title": "Vulnerability Title",
  "description": "Vulnerability Description",
  "platform": "web",
  "version": "1",
  "status": "active",
  "ipfs": {
    "cid": "Qm...",
    "data": {...},
    "url": "https://gateway.pinata.cloud/ipfs/Qm..."
  },
  "blockchain": {
    "contract": "0x...",
    "network": {...}
  }
}
```

**cURL Example:**
```bash
curl -X GET http://localhost:3000/vulnerabilities/getVulnerabilityByVersion/BVC-SOL-004/1
```

#### GET /getAllVulnerabilityIds
Gets all vulnerability IDs.

**Response:**
```json
{
  "count": 10,
  "ids": [...]
}
```

**cURL Example:**
```bash
curl -X GET http://localhost:3000/vulnerabilities/getAllVulnerabilityIds
```

#### GET /getPaginatedVulnerabilityIds
Gets paginated vulnerability IDs.

**Query Parameters:**
- `page`: Page number (default: 1)
- `pageSize`: Items per page (default: 10)

**Response:**
```json
{
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "totalCount": 25,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "ids": [...]
}
```

**cURL Example:**
```bash
curl -X GET "http://localhost:3000/getPaginatedVulnerabilityIds?page=1&pageSize=10"
```

#### POST /setVulnerabilityStatus
Sets the status of a vulnerability.

**Request Body:**
```json
{
  "id": "BVC-SOL-004",
  "isActive": true
}
```

**Response:**
```json
{
  "message": "Vulnerability status updated to active",
  "baseId": "0x...",
  "isActive": true,
  "blockchain": {
    "txHash": "0x...",
    "block": 123456,
    "contract": "0x..."
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/setVulnerabilityStatus \
  -H "Content-Type: application/json" \
  -d '{"id": "BVC-SOL-004", "isActive": true}'
```

### Health Endpoints

**File:** `routes/health.js`

#### GET /health
Checks the health of all required services.

**Response:**
```json
{
  "status": "OK",
  "checks": {
    "blockchain_connected": true,
    "ipfs_available": true,
    "contract_accessible": true
  },
  "timestamp": "2023-10-10T12:00:00.000Z"
}
```

**cURL Example:**
```bash
curl -X GET http://localhost:3000/health
```

## Middleware

### Logging Middleware

**File:** `middlewares/logging.js`

- `requestLogger`: Morgan middleware for logging HTTP requests

## Environment Variables

The following environment variables are required:

- `POLYGON_ZKEVM_RPC_URL`: RPC URL for the Polygon zkEVM network
- `PRIVATE_KEY`: Private key for the wallet
- `CONTRACT_ADDRESS`: Address of the deployed vulnerability contract
- `ABI_FILE_PATH`: Path to the contract ABI file
- `PINATA_JWT`: JWT for Pinata IPFS access
- `PORT`: (Optional) Port to run the server on (default: 3000)

## Getting Started

1. Clone the repository
2. Create a `.env` file with the required environment variables
3. Install dependencies with `npm install`
4. Start the server with `npm start`

## Error Handling

The application implements comprehensive error handling for:

- Invalid request parameters
- Contract errors
- IPFS upload/fetch failures
- Network connectivity issues

Each error response includes detailed information to help debug the issue.

## Logging

All application events are logged with:
- Console output for real-time monitoring
- Daily log files in the `logs/` directory for historical records
- Structured log entries with timestamp, route, type, message, and additional data