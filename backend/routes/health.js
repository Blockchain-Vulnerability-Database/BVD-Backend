const express = require('express');
const router = express.Router();
const axios = require('axios');
const { logger } = require('../services/logger');
const { contractConfig } = require('../config');

// Enhanced health check with dependency verification
router.get('/', async (req, res) => {
  logger('health', 'info', 'Health check initiated');
  
  const healthStatus = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    checks: {
      blockchain_connected: false,
      contract_accessible: false,
      ipfs_available: false,
      memory_usage: process.memoryUsage().heapUsed / 1024 / 1024
    },
    details: {
      network: await contractConfig.provider.getNetwork().catch(() => null),
      contract: process.env.CONTRACT_ADDRESS,
      lastBlock: null
    }
  };

  try {
    // 1. Blockchain Connection Check
    healthStatus.details.lastBlock = await contractConfig.provider.getBlockNumber();
    healthStatus.checks.blockchain_connected = true;
    logger('health', 'info', 'Blockchain connection verified');
    
    // 2. Contract Accessibility Check
    await contractConfig.contract.getAllBaseVulnerabilityIds();
    healthStatus.checks.contract_accessible = true;
    logger('health', 'info', 'Contract interaction successful');

    // 3. IPFS Gateway Check
    await axios.head('https://gateway.pinata.cloud', { 
      timeout: 3000,
      headers: {
        'User-Agent': 'BVD-Health-Check/1.0'
      }
    });
    healthStatus.checks.ipfs_available = true;
    logger('health', 'info', 'IPFS gateway reachable');

    // 4. Add additional checks here
    
    logger('health', 'success', 'Full health check passed');
    return res.json(healthStatus);

  } catch (error) {
    logger('health', 'error', 'Health check failure', {
      error: error.message,
      failedChecks: healthStatus.checks
    });

    healthStatus.status = 'PARTIAL_OUTAGE';
    healthStatus.error = error.message;
    
    // If blockchain failed, mark all dependent services as failed
    if (!healthStatus.checks.blockchain_connected) {
      healthStatus.checks.contract_accessible = false;
      healthStatus.status = 'SERVICE_UNAVAILABLE';
    }

    const statusCode = healthStatus.status === 'SERVICE_UNAVAILABLE' ? 503 : 200;
    return res.status(statusCode).json(healthStatus);
  }
});

module.exports = router;