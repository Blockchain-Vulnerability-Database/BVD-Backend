### 1. Vulnerability Submission
**Add New Vulnerability (with mandatory discoveryDate)**
```bash
curl -X POST http://localhost:3000/vulnerabilities/addVulnerability \
  -H "Content-Type: application/json" \
  -d '{
    "filePath": "./vulnerability.json"
  }'
```

**Example vulnerability.json with discoveryDate**
```json
{
  "title": "Test Vulnerability",
  "description": "A vulnerability description",
  "severity": "critical",
  "platform": "ETH",
  "discoveryDate": "2023-05-15"
}
```

**Example with year-only discoveryDate**
```json
{
  "title": "Test Vulnerability",
  "description": "A vulnerability description",
  "severity": "critical",
  "platform": "ETH",
  "discoveryDate": "2023"
}
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

### 5. Validation
**Validate Discovery Date**
```bash
curl "http://localhost:3000/vulnerabilities/validateDiscoveryDate?date=2023-05-15"
```

**Validate Year-Only Discovery Date**
```bash
curl "http://localhost:3000/vulnerabilities/validateDiscoveryDate?date=2023"
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

**Missing discoveryDate in Vulnerability JSON**
```bash
# Create vulnerability JSON without discoveryDate
cat > /tmp/missing-date.json << EOF
{
  "title": "Missing Date Test",
  "description": "This vulnerability is missing the required discoveryDate",
  "severity": "high",
  "platform": "ETH"
}
EOF

# Submit and expect error
curl -X POST http://localhost:3000/vulnerabilities/addVulnerability \
  -H "Content-Type: application/json" \
  -d '{"filePath": "/tmp/missing-date.json"}'

# Expected response:
# {"error":"Missing required fields","missing":["discoveryDate"]}
```

**Invalid discoveryDate Format**
```bash
# Create vulnerability JSON with invalid date format
cat > /tmp/invalid-date.json << EOF
{
  "title": "Invalid Date Test",
  "description": "This vulnerability has an invalid date format",
  "severity": "medium",
  "platform": "ETH",
  "discoveryDate": "05/15/2023"
}
EOF

# Submit and expect error
curl -X POST http://localhost:3000/vulnerabilities/addVulnerability \
  -H "Content-Type: application/json" \
  -d '{"filePath": "/tmp/invalid-date.json"}'

# Expected response:
# {"error":"Invalid discoveryDate format","details":"discoveryDate must be in YYYY-MM-DD or YYYY format"}
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