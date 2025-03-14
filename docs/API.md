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

### 3. **GET /preGenerateBvcId**
Pre-generate a BVC ID before submitting a vulnerability. This allows the client to know the BVC ID that will be assigned, which can be used for naming the IPFS file.

#### Query Parameters
- `platform`: (string) The platform code (e.g., `ETH`).
- `discoveryDate`: (string) The discovery date (e.g., `2023` or `2023-05-15`).

#### Response
- **200 OK**
```json
{
  "bvcId": "BVC-ETH-2023-001",
  "platform": "ETH",
  "discoveryDate": "2023-05-15"
}
```
- **400 Bad Request** (Invalid platform)
```json
{
  "error": "Invalid platform format",
  "details": "Platform must be 2-5 uppercase letters (e.g., ETH, SOL, MULTI)"
}
```
- **400 Bad Request** (Invalid date)
```json
{
  "error": "Invalid discoveryDate format",
  "details": "discoveryDate must be in YYYY-MM-DD or YYYY format"
}
```

---

### 4. **POST /addVulnerability**
Add a new vulnerability to the database and smart contract. The BVC ID will be auto-generated in the format `BVC-[PLATFORM]-[YEAR]-[ID]`. The IPFS file will be named using the same BVC ID format (e.g., `BVC-ETH-2023-001.json`).

#### Request Body
```json
{
  "filePath": "/path/to/vulnerability.json"
}
```

#### Vulnerability JSON Format
```json
{
  "title": "Test Vulnerability",
  "description": "A sample vulnerability for testing.",
  "severity": "high",
  "platform": "ETH",
  "discoveryDate": "2023-05-15"
}
```

#### Response
- **201 Created**
```json
{
  "message": "Vulnerability recorded",
  "identifiers": {
    "bvcId": "BVC-ETH-2023-001",
    "bytes32BaseId": "0x..."
  },
  "blockchain": {
    "txHash": "0x...",
    "block": 123456
  },
  "ipfs": {
    "cid": "Qm...",
    "url": "https://gateway.pinata.cloud/ipfs/Qm...",
    "filename": "BVC-ETH-2023-001.json"
  }
}
```
- **400 Bad Request** (Platform format)
```json
{
  "error": "Invalid platform format",
  "details": "Platform must be 2-5 uppercase letters (e.g., ETH, SOL, MULTI)"
}
```
- **400 Bad Request** (Missing discovery date)
```json
{
  "error": "Missing required fields",
  "missing": ["discoveryDate"]
}
```
- **400 Bad Request** (Invalid discovery date)
```json
{
  "error": "Invalid discoveryDate format",
  "details": "discoveryDate must be in YYYY-MM-DD or YYYY format"
}
```

---

### 5. **GET /getVulnerability/:id**
Retrieve details for a specific vulnerability.

#### Path Parameters
- `id`: The BVC ID of the vulnerability (e.g., `BVC-ETH-2023-001`).

#### Response
- **200 OK**
```json
{
  "bvc_id": "BVC-ETH-2023-001",
  "bytes32BaseId": "0x...",
  "title": "Test Vulnerability",
  "description": "A sample vulnerability for testing.",
  "platform": "ETH",
  "discoveryDate": "2023-05-15",
  "version": "1",
  "status": "active",
  "ipfs": {
    "cid": "Qm...",
    "data": {...},
    "url": "https://gateway.pinata.cloud/ipfs/Qm..."
  }
}
```
- **404 Not Found**
```json
{
  "error": "Vulnerability not found"
}
```

---

### 6. **POST /setVulnerabilityStatus**
Update the active status of a vulnerability.

#### Request Body
```json
{
  "id": "BVC-ETH-2023-001",
  "isActive": false
}
```

#### Response
- **200 OK**
```json
{
  "message": "Status updated to inactive",
  "txHash": "0x...",
  "block": 123456
}
```
- **400 Bad Request**
```json
{
  "error": "Invalid request parameters"
}
```

---

### 7. **GET /getAllVulnerabilities**
Retrieve all vulnerabilities stored in the database.

#### Response
- **200 OK**
```json
{
  "count": 10,
  "vulnerabilities": [
    {
      "bvc_id": "BVC-ETH-2023-001",
      "baseId": "0x...",
      "version": "1",
      "title": "Test Vulnerability",
      "description": "A sample vulnerability for testing.",
      "platform": "ETH",
      "discoveryDate": "2023-05-15",
      "ipfsCid": "Qm...",
      "isActive": true,
      "metadata": {...}
    }
  ]
}
```

---

### 8. **GET /getPaginatedVulnerabilityIds**
Retrieve vulnerability IDs in a paginated format.

#### Query Parameters
- `page`: (integer) The page number (e.g., `1`).
- `pageSize`: (integer) The number of items per page (e.g., `10`).

#### Response
- **200 OK**
```json
{
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "total": 25
  },
  "bvcIds": [
    "BVC-ETH-2023-001",
    "BVC-SOL-2023-001",
    "BVC-MULTI-2023-001"
  ]
}
```
- **400 Bad Request**
```json
{
  "error": "Invalid pagination parameters",
  "details": "Page and pageSize must be positive integers"
}
```

---

### 9. **GET /getVulnerabilityVersions/:id**
Retrieve all versions of a specific vulnerability.

#### Path Parameters
- `id`: The BVC ID or base ID of the vulnerability (e.g., `BVC-ETH-2023-001`).

#### Response
- **200 OK**
```json
{
  "id": "BVC-ETH-2023-001",
  "versions": [
    {
      "bvc_id": "BVC-ETH-2023-001",
      "version": "1",
      "title": "Test Vulnerability v1",
      "description": "Initial description",
      "ipfsCid": "Qm...",
      "platform": "ETH",
      "discoveryDate": "2023-05-15",
      "isActive": false
    },
    {
      "bvc_id": "BVC-ETH-2023-001-v2",
      "version": "2",
      "title": "Test Vulnerability v2",
      "description": "Updated description",
      "ipfsCid": "Qm...",
      "platform": "ETH",
      "discoveryDate": "2023-06-20",
      "isActive": true
    }
  ]
}
```
- **404 Not Found**
```json
{
  "error": "Vulnerability not found"
}
```

---

### 10. **GET /getAllVulnerabilityIds**
Retrieve all vulnerability IDs.

#### Response
- **200 OK**
```json
{
  "count": 3,
  "bvcIds": [
    "BVC-ETH-2023-001",
    "BVC-SOL-2023-001",
    "BVC-MULTI-2023-001"
  ]
}
```

---

### 11. **GET /getCurrentCounter**
Get the current counter for a specific platform and year.

#### Query Parameters
- `platform`: (string) The platform code (e.g., `ETH`).
- `year`: (integer) The year (e.g., `2023`).

#### Response
- **200 OK**
```json
{
  "platform": "ETH",
  "year": 2023,
  "counter": 5
}
```
- **400 Bad Request**
```json
{
  "error": "Invalid platform format",
  "details": "Platform must be 2-5 uppercase letters (e.g., ETH, SOL, MULTI)"
}
```

---

### 12. **POST /setCounter**
Set the counter for a specific platform and year (admin only).

#### Request Body
```json
{
  "platform": "ETH",
  "year": 2023,
  "value": 10
}
```

#### Response
- **200 OK**
```json
{
  "message": "Counter updated",
  "platform": "ETH",
  "year": 2023,
  "value": 10,
  "txHash": "0x..."
}
```
- **401 Unauthorized**
```json
{
  "error": "Caller is not the owner"
}
```

---

### 13. **GET /validateDiscoveryDate**
Validate a discovery date string format.

#### Query Parameters
- `date`: (string) The date to validate (e.g., `2023` or `2023-05-15`).

#### Response
- **200 OK** (Valid date)
```json
{
  "valid": true,
  "year": 2023
}
```
- **400 Bad Request** (Invalid date)
```json
{
  "valid": false,
  "error": "Discovery date must be in YYYY or YYYY-MM-DD format"
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
- **401 Unauthorized**: Authentication errors.
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

---

## BVC ID Format
All vulnerability IDs follow the format: `BVC-[PLATFORM]-[YEAR]-[ID]`

- `BVC`: Fixed prefix
- `[PLATFORM]`: 2-5 uppercase letters (e.g., ETH, SOL, MULTI)
- `[YEAR]`: 4-digit year from discovery date (e.g., 2023)
- `[ID]`: 3-5 digit sequential number (e.g., 001, 12345)

Examples:
- `BVC-ETH-2023-001`
- `BVC-SOL-2023-001`
- `BVC-MULTI-2023-001`

---

## Discovery Date Format
The discovery date field is mandatory for all vulnerability submissions and must follow one of these formats:

- `YYYY`: Year only (e.g., `2023`)
- `YYYY-MM-DD`: Full date (e.g., `2023-05-15`)

The year portion must be between 1990 and 9999.

The year from the discovery date is used in the BVC ID format.

---

## IPFS Filenames
IPFS files are now named according to the BVC ID format to ensure consistency and traceability:

- Filename format: `BVC-[PLATFORM]-[YEAR]-[ID].json`
- Examples: 
  - `BVC-ETH-2023-001.json`
  - `BVC-SOL-2023-042.json`
  - `BVC-MULTI-2023-100.json`

This naming convention ensures that:
1. IPFS filenames match their corresponding blockchain entries
2. Files can be easily located and referenced
3. Version history is preserved in the filename structure