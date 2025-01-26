
# Blockchain Vulnerability Database API Documentation

## Base URL
- Local: `http://localhost:3000`
- Production: Replace with your production URL.

---

## Endpoints

### 1. **GET /status**
Check the status of the blockchain connection.

#### Response
```json
{
  "status": "success",
  "blockNumber": 17297106
}
```

### 2. **GET /health**
Check the health of the server, blockchain, and IPFS connection.

#### Response
- **200 OK** (All systems operational)
```json
{
  "server": "up",
  "blockchain": "connected, blockNumber: 17297106",
  "ipfs": "connected",
  "timestamp": "2025-01-26T00:00:00.000Z"
}
```
- **503 Service Unavailable** (One or more systems are down)
```json
{
  "server": "up",
  "blockchain": "error",
  "ipfs": "error",
  "timestamp": "2025-01-26T00:00:00.000Z"
}
```

---

### 3. **POST /addVulnerability**
Add a new vulnerability to the database and smart contract.

#### Request Body
```json
{
  "id": "BVC-TEST-001",
  "title": "Test Vulnerability",
  "description": "A sample vulnerability for testing.",
  "metadata": "/path/to/metadata.json"
}
```

#### Response
- **201 Created**
```json
{
  "message": "Vulnerability added successfully.",
  "receipt": { ...transactionReceipt }
}
```
- **400 Bad Request**
```json
{
  "errors": [
    { "msg": "id is required and must be a string", "path": "id" },
    { "msg": "metadata file path is invalid or does not exist", "path": "metadata" }
  ]
}
```

---

### 4. **GET /getVulnerability/:id**
Retrieve details for a specific vulnerability.

#### Path Parameters
- `id`: The unique ID of the vulnerability (e.g., `BVC-TEST-001`).

#### Response
- **200 OK**
```json
{
  "status": "success",
  "vulnerability": {
    "id": "BVC-TEST-001",
    "title": "Test Vulnerability",
    "description": "A sample vulnerability for testing.",
    "ipfsCid": "Qm...",
    "isActive": true
  }
}
```
- **404 Not Found**
```json
{
  "error": "Vulnerability does not exist"
}
```

---

### 5. **POST /setVulnerabilityStatus**
Update the active status of a vulnerability.

#### Request Body
```json
{
  "id": "BVC-TEST-001",
  "isActive": false
}
```

#### Response
- **200 OK**
```json
{
  "message": "Vulnerability status updated successfully",
  "receipt": { ...transactionReceipt }
}
```
- **400 Bad Request**
```json
{
  "errors": [
    { "msg": "isActive must be a boolean value", "path": "isActive" }
  ]
}
```

---

### 6. **GET /getAllVulnerabilities**
Retrieve all vulnerabilities stored in the database.

#### Response
- **200 OK**
```json
{
  "status": "success",
  "vulnerabilities": [
    {
      "id": "BVC-TEST-001",
      "title": "Test Vulnerability",
      "description": "A sample vulnerability for testing.",
      "ipfsCid": "Qm...",
      "isActive": true
    }
  ]
}
```

---

### 7. **GET /getVulnerabilitiesPaginated**
Retrieve vulnerabilities in a paginated format.

#### Query Parameters
- `page`: (integer) The page number (e.g., `1`).
- `pageSize`: (integer) The number of items per page (e.g., `10`).

#### Response
- **200 OK**
```json
{
  "status": "success",
  "vulnerabilities": [
    {
      "id": "BVC-TEST-001",
      "title": "Test Vulnerability",
      "description": "A sample vulnerability for testing.",
      "ipfsCid": "Qm...",
      "isActive": true
    }
  ]
}
```
- **400 Bad Request**
```json
{
  "errors": [
    { "msg": "Page must be a positive integer", "path": "page" }
  ]
}
```

---

### 8. **GET /getFileContentsFromIPFS/:cid**
Retrieve metadata from IPFS for a given CID.

#### Path Parameters
- `cid`: The IPFS CID of the file (e.g., `Qm...`).

#### Response
- **200 OK**
```json
{
  "id": "BVC-TEST-001",
  "title": "Test Vulnerability",
  ...
}
```
- **500 Internal Server Error**
```json
{
  "status": "error",
  "message": "Could not retrieve file from IPFS for CID: Qm..."
}
```

---

### 9. **DELETE /deleteFileFromIPFSIfUnreferenced/:cid**
Delete an unreferenced file from IPFS.

#### Path Parameters
- `cid`: The IPFS CID to unpin (e.g., `Qm...`).

#### Response
- **200 OK**
```json
{
  "status": "success",
  "message": "CID Qm... was not in the contract and has been unpinned."
}
```
- **400 Bad Request**
```json
{
  "status": "error",
  "message": "CID Qm... is still referenced in the contract."
}
```

---

### 10. **GET /getHashAndCid/:id**
Retrieve the file hash and CID for a vulnerability ID.

#### Path Parameters
- `id`: The unique ID of the vulnerability (e.g., `BVC-TEST-001`).

#### Response
- **200 OK**
```json
{
  "status": "success",
  "data": {
    "id": "BVC-TEST-001",
    "cid": "Qm...",
    "fileHash": "abcd1234..."
  }
}
```
- **404 Not Found**
```json
{
  "status": "error",
  "message": "No CID found for ID BVC-TEST-001"
}
```

---

## HTTP Response Headers
- `X-Request-ID`: Unique request ID for debugging.
- `X-Content-Type-Options`: `nosniff`
- `X-Frame-Options`: `DENY`
- `X-XSS-Protection`: `1; mode=block`
- `X-Powered-By`: `Vulnerability Registry Service`

---

## Error Handling
- **400 Bad Request**: Input validation errors.
- **404 Not Found**: Resource not found.
- **500 Internal Server Error**: General server errors.

---

## Rate Limiting
- Max 100 requests per IP per 15 minutes.
- Exceeds limit: **429 Too Many Requests**

---

## CORS
- Allowed Origins: `https://your-frontend-domain.com`
- Allowed Methods: `GET, POST`
