## Add Vulnerability
```
curl -X POST http://localhost:3000/addVulnerability \
     -H "Content-Type: application/json" \
     -d '{"filePath": "/Users/dcurtis/Git/BVD/BVD-Smart-Contract/entries/bvc-sol-002.json"}'
```

## Get Vulnerability
```shell
curl -X GET http://localhost:3000/getVulnerability/BVC-SOL-002
```

## Get All Vulnerabilities
```shell
curl -X GET "http://your-api-domain.com/getAllVulnerabilities?page=1&limit=50" \
  -H "Authorization: Bearer your_jwt_token_here" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```