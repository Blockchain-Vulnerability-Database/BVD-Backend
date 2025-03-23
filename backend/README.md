# Backend Module Structure

This document provides an overview of the backend codebase structure, explaining the purpose and functionality of each file and directory.

## Directory Structure

```
backend/
├── config/
│   └── index.js             # Configuration and blockchain connection setup
├── middlewares/
│   └── logging.js           # Request logging and error handling middlewares
├── routes/
│   ├── health.js            # Health check endpoints for monitoring
│   ├── index.js             # Main router that combines all route modules
│   ├── vulnerabilities.js   # Legacy vulnerabilities router (backward compatibility)
│   └── vulnerabilities/     # Modular vulnerability route handlers
│       ├── index.js         # Vulnerabilities router combining all submodules
│       ├── create.js        # Vulnerability creation endpoints
│       ├── query.js         # Vulnerability querying and retrieval endpoints
│       ├── versions.js      # Version management endpoints
│       ├── status.js        # Vulnerability status management
│       └── validate.js      # Validation endpoints for vulnerability data
├── services/
│   ├── blockchain.js        # Blockchain interaction service
│   ├── ipfs.js              # IPFS file storage service
│   └── logger.js            # Logging service
└── utils/
    └── helpers.js           # Utility functions and helpers
```

## File Descriptions

### Config

- **index.js**: Sets up the blockchain connection, including provider initialization, wallet configuration, and contract loading. Validates network connectivity and exports the initialized contract configuration.

### Middlewares

- **logging.js**: Provides request logging using Morgan and a custom error handler middleware that logs errors and returns appropriate responses.

### Routes

- **index.js**: Main router that combines all route modules, exposing them under their respective paths.
- **health.js**: Implements health check endpoints that verify connectivity to blockchain, contract accessibility, and IPFS availability.
- **vulnerabilities.js**: Legacy router that provides backward compatibility for existing vulnerability endpoints while also exposing the new modular structure.

### Routes/Vulnerabilities

- **index.js**: Combines all vulnerability-related subrouters and provides backward compatibility mappings.
- **create.js**: Handles vulnerability creation endpoints, including BVC ID pre-generation and vulnerability submission.
- **query.js**: Implements endpoints for retrieving vulnerability data, including single vulnerability lookup, all vulnerabilities, and paginated queries.
- **versions.js**: Manages endpoints related to vulnerability versioning.
- **status.js**: Handles vulnerability status updates (active/inactive).
- **validate.js**: Provides validation endpoints for discovery dates, technical details, and proof of exploit.

### Services

- **blockchain.js**: Core service for interacting with the blockchain, implementing all contract method calls, error handling, and event processing.
- **ipfs.js**: Service for uploading files to IPFS via Pinata, handling file formatting and API interactions.
- **logger.js**: Provides structured logging functionality, writing to both console and daily log files.

### Utils

- **helpers.js**: Contains utility functions for ID generation, validation, and parsing, including functions to generate deterministic IDs and extract components from BVC IDs.

## Key Features

- **Blockchain Integration**: Complete integration with the BVC (Blockchain Vulnerability Catalog) smart contract on Polygon zkEVM.
- **IPFS Storage**: Persistence of vulnerability details on IPFS for decentralized storage and immutability.
- **Modular Architecture**: Well-organized code with clear separation of concerns between routes, services, and utilities.
- **Comprehensive Logging**: Detailed logging throughout the application for traceability and debugging.
- **Health Monitoring**: Robust health check system that verifies all dependencies are functioning correctly.
- **Backward Compatibility**: Support for existing API endpoints while introducing a cleaner, more organized structure.

This new modular structure improves maintainability by breaking down the monolithic vulnerabilities.js file into smaller, focused modules while preserving all functionality and ensuring backward compatibility.