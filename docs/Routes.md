# BVD Registry API Routes

## 🔹 Vulnerability Submission & Retrieval Routes

### 1. `POST /addVulnerability`
**Description:** Submits a new vulnerability, uploads metadata to IPFS, and records it on the blockchain.  

#### Request Body:
```json
{
  "filePath": "/path/to/vulnerability.json"
}
```

#### Response:
```json
{
  "message": "Vulnerability recorded",
  "identifiers": {
    "text": "BVC-SOL-005",
    "bytes32": "0x854400..."
  },
  "blockchain": {
    "txHash": "0x02320...",
    "block": 11271049,
    "contract": "0x9f63aF..."
  },
  "ipfs": {
    "cid": "QmYUu36...",
    "url": "https://gateway.pinata.cloud/ipfs/QmYUu36..."
  }
}
```

---

### 2. `GET /getVulnerability/:id`
**Description:** Retrieves a specific vulnerability from the blockchain and its metadata from IPFS.  

#### Request Example:
```
GET /getVulnerability/BVC-SOL-005
```

#### Response:
```json
{
  "id": "BVC-SOL-005",
  "bytes32Id": "0x854400...",
  "title": "Reentrancy Attack",
  "description": "This contract is vulnerable...",
  "version": "1",
  "status": "active",
  "ipfs": {
    "cid": "QmYUu36...",
    "data": { /* Full IPFS Metadata */ },
    "url": "https://gateway.pinata.cloud/ipfs/QmYUu36..."
  },
  "blockchain": {
    "contract": "0x9f63aF...",
    "network": {
      "name": "unknown",
      "chainId": "2442"
    }
  }
}
```

---

### 3. `GET /getAllVulnerabilities`
**Description:** Retrieves all vulnerability IDs from the blockchain and fetches their metadata from IPFS.  

#### Response:
```json
{
  "status": "success",
  "vulnerabilities": [
    {
      "id": "BVC-SOL-005",
      "title": "Reentrancy Attack",
      "description": "This contract is vulnerable...",
      "ipfsCid": "QmYUu36...",
      "isActive": true,
      "blockchainStatus": "Stored on Blockchain",
      "ipfsStatus": "Retrieved Successfully",
      "metadata": { /* Full IPFS Metadata */ }
    }
  ]
}
```

---

## 🔹 Blockchain Utility Routes

### 4. `GET /getAllVulnerabilityIds`
**Description:** Fetches all recorded vulnerability IDs from the blockchain.  

#### Response Example:
```json
{
  "ids": [
    "0x854400...",
    "0xe5c32f..."
  ]
}
```

---

### 5. `GET /getPaginatedVulnerabilityIds?page=<num>&pageSize=<num>`
**Description:** Fetches a paginated list of vulnerability IDs.  

#### Example:
```
GET /getPaginatedVulnerabilityIds?page=1&pageSize=10
```

#### Response:
```json
{
  "ids": [
    "0x854400...",
    "0xe5c32f..."
  ]
}
```

---

### 6. `POST /setVulnerabilityStatus`
**Description:** Updates the status (active/inactive) of a vulnerability.  

#### Request Body:
```json
{
  "id": "BVC-SOL-005",
  "isActive": false
}
```

#### Response:
```json
{
  "message": "Vulnerability status updated",
  "id": "BVC-SOL-005",
  "status": "inactive"
}
```

---

## 🔹 Health Check & Debugging Routes

### 7. `GET /health`
**Description:** Checks blockchain, IPFS, and contract connectivity.  

#### Response Example:
```json
{
  "status": "OK",
  "checks": {
    "blockchain_connected": true,
    "ipfs_available": true,
    "contract_accessible": true
  },
  "timestamp": "2024-03-07T12:00:00Z"
}
```

---

## 🔹 Debugging Utilities

### 8. `GET /getIdBytes32/:id`
**Description:** Converts a text ID into a keccak256 hash (bytes32 format) for blockchain queries.  

#### Example:
```
GET /getIdBytes32/BVC-SOL-005
```

#### Response:
```json
{
  "textId": "BVC-SOL-005",
  "bytes32": "0x854400..."
}
```

---

These routes provide full functionality for **submitting, retrieving, updating, and listing vulnerabilities** while ensuring **blockchain-IPFS integration**.
