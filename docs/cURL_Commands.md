### 1. Vulnerability Submission
**Add New Vulnerability**
```bash
curl -X POST http://localhost:3000/vulnerabilities/addVulnerability \
  -H "Content-Type: application/json" \
  -d '{
    "filePath": "./vulnerability.json"
  }'
```

### 2. Vulnerability Retrieval
**Get Latest Version**
```bash
curl "http://localhost:3000/vulnerabilities/getVulnerability/BVC-ABC-123"
```

**Get Specific Version**
```bash
curl "http://localhost:3000/vulnerabilities/getVulnerabilityByVersion/BVC-ABC-123/2"
```

**Get Version History**
```bash
curl "http://localhost:3000/vulnerabilities/getVulnerabilityVersions/BVC-ABC-123"
```

### 3. Batch Operations
**Get All Vulnerabilities**
```bash
curl "http://localhost:3000/vulnerabilities/getAllVulnerabilities"
```

**Get All Vulnerability IDs**
```bash
curl "http://localhost:3000/vulnerabilities/getAllVulnerabilityIds"
```

**Get Paginated IDs**
```bash
curl "http://localhost:3000/vulnerabilities/getPaginatedVulnerabilityIds?page=2&pageSize=10"
```

### 4. Status Management
**Update Vulnerability Status**
```bash
curl -X POST http://localhost:3000/vulnerabilities/setVulnerabilityStatus \
  -H "Content-Type: application/json" \
  -d '{
    "id": "BVC-ABC-123",
    "isActive": false
  }'
```

### 5. Health & Monitoring
**System Health Check**
```bash
curl "http://localhost:3000/health"
```

### 6. Error Scenario Examples
**Invalid ID Format**
```bash
curl "http://localhost:3000/vulnerabilities/getVulnerability/invalid_id_123"

# Expected response:
# {"error":"Invalid ID format","expectedFormat":"BVC-XXX-000 (X=uppercase letter, 0=digit)"}
```

**Missing Required Field**
```bash
curl -X POST http://localhost:3000/vulnerabilities/addVulnerability \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected response:
# {"error":"filePath parameter is required"}
```

**Non-existent Vulnerability**
```bash
curl "http://localhost:3000/vulnerabilities/getVulnerability/BVC-ZZZ-999"

# Expected response:
# {"error":"Vulnerability not found"}
```

### Request/Response Notes:
1. **Successful Responses** will include:
   - `200 OK` for GET requests
   - `201 Created` for successful submissions
   - Full blockchain/IPFS metadata

2. **Error Responses** will contain:
   - `4xx` status for client errors
   - `5xx` status for server errors
   - Detailed error message in JSON format
   - Error code reference when available

3. **Timeout Handling**:
   - IPFS operations timeout after 3 seconds
   - Blockchain operations use provider timeout (typically 30-60 seconds)

4. **Rate Limiting**:
   - No built-in rate limiting (assumes reverse proxy handling)
   - Recommend 1 request/second for bulk operations

### Testing Tips:
1. **Log Monitoring**:
```bash
tail -f logs/*.log | grep -E 'ERROR|WARN'
```

2. **Performance Testing**:
```bash
# Basic load test (install apache bench first)
ab -n 100 -c 10 http://localhost:3000/health
```

3. **Network Inspection**:
```bash
# Monitor blockchain RPC calls
export DEBUG=provider,contract
node server.js
```

Let me know if you'd like me to explain any specific endpoint in more detail!