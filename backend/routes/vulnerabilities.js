const express = require('express');
const router = express.Router();
const fs = require('fs');
const axios = require('axios');
const { ethers } = require('ethers');
const crypto = require('crypto');
const { logger } = require('../services/logger');
const blockchain = require('../services/blockchain');
const ipfs = require('../services/ipfs');
const { 
  validateVulnerabilityId,
  parseVersion,
  generateBaseId 
} = require('../utils/helpers');

// POST /vulnerabilities/addVulnerability
router.post('/addVulnerability', async (req, res) => {
  logger('addVulnerability', 'info', 'Request received', { filePath: req.body.filePath });
  
  try {
    if (!req.body.filePath) {
      logger('addVulnerability', 'error', 'Missing filePath parameter');
      return res.status(400).json({ error: 'filePath parameter is required' });
    }

    // Read and validate vulnerability file
    let vulnerabilityData;
    try {
      vulnerabilityData = JSON.parse(fs.readFileSync(req.body.filePath, 'utf8'));
      logger('addVulnerability', 'info', 'File loaded', { id: vulnerabilityData.id });
    } catch (error) {
      logger('addVulnerability', 'error', 'File error', { error: error.message });
      return res.status(400).json({ error: 'Invalid vulnerability file', details: error.message });
    }

    // Validate required fields - severity removed from required fields
    const requiredFields = ['title', 'description', 'platform', 'discoveryDate'];
    const missingFields = requiredFields.filter(f => !vulnerabilityData[f]);
    if (missingFields.length > 0) {
      logger('addVulnerability', 'error', 'Missing fields', { missing: missingFields });
      return res.status(400).json({ error: 'Missing required fields', missing: missingFields });
    }

    // Validate platform format (2-5 uppercase letters)
    const platformRegex = /^[A-Z]{2,5}$/;
    if (!platformRegex.test(vulnerabilityData.platform)) {
      logger('addVulnerability', 'error', 'Invalid platform format', { platform: vulnerabilityData.platform });
      return res.status(400).json({ 
        error: 'Invalid platform format', 
        details: 'Platform must be 2-5 uppercase letters (e.g., ETH, SOL, MULTI)' 
      });
    }

    // Validate discoveryDate format (required)
    const dateRegex = /^(\d{4}(-\d{2}-\d{2})?)$/;
    if (!dateRegex.test(vulnerabilityData.discoveryDate)) {
      logger('addVulnerability', 'error', 'Invalid discoveryDate format', { discoveryDate: vulnerabilityData.discoveryDate });
      return res.status(400).json({
        error: 'Invalid discoveryDate format',
        details: 'discoveryDate must be in YYYY-MM-DD or YYYY format'
      });
    }

    // Validate year range (1990-9999)
    const year = parseInt(vulnerabilityData.discoveryDate.substring(0, 4));
    if (isNaN(year) || year < 1990 || year > 9999) {
      logger('addVulnerability', 'error', 'Invalid discoveryDate year', { year });
      return res.status(400).json({
        error: 'Invalid discoveryDate year',
        details: 'Year must be between 1990 and 9999'
      });
    }

    // Upload to IPFS
    const fileBuffer = Buffer.from(JSON.stringify(vulnerabilityData, null, 2));
    const ipfsCid = await ipfs.uploadToIPFS(fileBuffer, `${vulnerabilityData.platform}-vulnerability.json`);
    logger('addVulnerability', 'info', 'IPFS upload success', { cid: ipfsCid });

    // Generate blockchain ID - we still need baseId for the smart contract
    let baseIdBytes32;
    if (vulnerabilityData.id) {
      // Use provided ID if available
      baseIdBytes32 = generateBaseId(vulnerabilityData.id);
    } else {
      // Generate deterministic baseId using Node.js crypto module
      const dataString = `${vulnerabilityData.platform}-${vulnerabilityData.title}-${Date.now()}`;
      baseIdBytes32 = '0x' + crypto.createHash('sha256')
        .update(dataString)
        .digest('hex')
        .substring(0, 64); // Ensure it's 32 bytes (64 hex chars)
    }
    
    // Submit to blockchain with discoveryDate
    const tx = await blockchain.addVulnerability(
      baseIdBytes32,
      vulnerabilityData.title,
      vulnerabilityData.description,
      ipfsCid,
      vulnerabilityData.platform,
      vulnerabilityData.discoveryDate
    );

    const receipt = await tx.wait();
    
    // Get the BVC ID from the transaction receipt
    let bvcId = null;
    try {
      // Extract BVC ID from event logs (look for VulnerabilityRegistered event)
      const events = await blockchain.getEventsFromReceipt(receipt, 'VulnerabilityRegistered');
      if (events && events.length > 0) {
        bvcId = events[0].args.bvc_id;
      }
    } catch (eventError) {
      logger('addVulnerability', 'warn', 'Failed to extract BVC ID from events', { error: eventError.message });
    }

    logger('addVulnerability', 'info', 'Blockchain confirmed', { 
      block: receipt.blockNumber,
      txHash: tx.hash,
      bvcId: bvcId
    });

    res.status(201).json({
      message: 'Vulnerability recorded',
      identifiers: {
        bvcId: bvcId, // The auto-generated BVC ID
        bytes32BaseId: baseIdBytes32
      },
      blockchain: {
        txHash: tx.hash,
        block: receipt.blockNumber
      },
      ipfs: {
        cid: ipfsCid,
        url: `https://gateway.pinata.cloud/ipfs/${ipfsCid}`
      }
    });

  } catch (error) {
    logger('addVulnerability', 'error', 'Submission failed', { 
      error: error.message,
      stack: error.stack 
    });
    
    const statusCode = error.message.includes('already exists') ? 409 : 500;
    res.status(statusCode).json({
      error: error.message.includes('already exists') 
        ? 'Vulnerability already exists' 
        : 'Submission failed',
      details: error.message
    });
  }
});

// GET /vulnerabilities/getVulnerability/:id
router.get('/getVulnerability/:id', async (req, res) => {
  const { id } = req.params;
  logger('getVulnerability', 'info', 'Request received', { id });
  
  try {
    // No need to validate vulnerability ID format, as we now accept the BVC ID directly
    
    try {
      // Call the updated blockchain method that uses BVC ID string directly
      const vulnerability = await blockchain.getVulnerability(id);
      const [bvc_id, version, baseId, title, description, ipfsCid, platform, discoveryDate, isActive] = vulnerability;

      // Fetch IPFS data
      let ipfsData = null;
      if (ipfsCid) {
        try {
          const response = await axios.get(`https://gateway.pinata.cloud/ipfs/${ipfsCid}`, { timeout: 3000 });
          ipfsData = response.data;
        } catch (ipfsError) {
          logger('getVulnerability', 'warn', 'IPFS fetch failed', { cid: ipfsCid });
        }
      }

      res.json({
        bvc_id,
        bytes32BaseId: baseId,
        title,
        description,
        platform,
        discoveryDate,
        version: version.toString(),
        status: isActive ? 'active' : 'inactive',
        ipfs: {
          cid: ipfsCid,
          data: ipfsData,
          url: ipfsCid ? `https://gateway.pinata.cloud/ipfs/${ipfsCid}` : null
        }
      });

    } catch (error) {
      if (error.message.includes('does not exist')) {
        return res.status(404).json({ error: 'Vulnerability not found' });
      }
      throw error;
    }

  } catch (error) {
    logger('getVulnerability', 'error', 'Retrieval failed', { 
      error: error.message,
      stack: error.stack 
    });
    
    if (error.message.includes('Invalid ID format')) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to retrieve vulnerability' });
  }
});

// GET /vulnerabilities/getAllVulnerabilities
router.get('/getAllVulnerabilities', async (req, res) => {
  try {
    // Call the updated method that returns both base IDs and BVC IDs
    const result = await blockchain.getAllBaseIds();
    const { baseIds, bvcIds } = result;
    
    if (!baseIds || !baseIds.length) {
      return res.status(404).json({ error: 'No vulnerabilities found' });
    }

    const vulnerabilities = [];
    for (let i = 0; i < baseIds.length; i++) {
      try {
        // Use the BVC ID to get the vulnerability data
        const vuln = await blockchain.getVulnerability(bvcIds[i]);
        const [bvc_id, version, baseId, title, description, ipfsCid, platform, discoveryDate, isActive] = vuln;

        let ipfsMetadata = null;
        if (ipfsCid) {
          try {
            const response = await axios.get(`https://gateway.pinata.cloud/ipfs/${ipfsCid}`);
            ipfsMetadata = response.data;
          } catch (error) {
            logger('getAllVulnerabilities', 'warn', 'IPFS fetch failed', { cid: ipfsCid });
          }
        }

        vulnerabilities.push({
          bvc_id,
          baseId,
          version: version.toString(),
          title,
          description,
          platform,
          discoveryDate,
          ipfsCid,
          isActive,
          metadata: ipfsMetadata
        });
      } catch (error) {
        logger('getAllVulnerabilities', 'error', 'Skipping invalid entry', { baseId: baseIds[i] });
      }
    }

    res.json({ count: vulnerabilities.length, vulnerabilities });

  } catch (error) {
    logger('getAllVulnerabilities', 'error', 'Failed to retrieve', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve vulnerabilities' });
  }
});

// GET /vulnerabilities/getPaginatedAllVulnerabilities
router.get('/getPaginatedAllVulnerabilities', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;
  
  logger('getPaginatedAllVulnerabilities', 'info', 'Request received', { page, pageSize });
  
  try {
    // Validate pagination parameters
    if (page < 1 || pageSize < 1) {
      logger('getPaginatedAllVulnerabilities', 'error', 'Invalid pagination parameters', { page, pageSize });
      return res.status(400).json({
        error: 'Invalid pagination parameters',
        details: 'Page and pageSize must be positive integers'
      });
    }
    
    // Use the updated blockchain service to get paginated vulnerabilities
    // This now returns BVC IDs instead of base IDs
    const bvcIds = await blockchain.getPaginatedVulnerabilityIds(page, pageSize);
    
    if (!bvcIds || !bvcIds.length) {
      return res.status(404).json({ error: 'No vulnerabilities found for this page' });
    }
    
    // Format the vulnerabilities with their full data and IPFS metadata
    const formattedVulnerabilities = [];
    
    for (const bvcId of bvcIds) {
      try {
        const vuln = await blockchain.getVulnerability(bvcId);
        const [bvc_id, version, baseId, title, description, ipfsCid, platform, discoveryDate, isActive] = vuln;
        
        let ipfsMetadata = null;
        
        if (ipfsCid) {
          try {
            const response = await axios.get(`https://gateway.pinata.cloud/ipfs/${ipfsCid}`, 
              { timeout: 3000 });
            ipfsMetadata = response.data;
          } catch (error) {
            logger('getPaginatedAllVulnerabilities', 'warn', 'IPFS fetch failed', { 
              cid: ipfsCid,
              error: error.message 
            });
          }
        }
        
        formattedVulnerabilities.push({
          bvc_id,
          baseId,
          version: version.toString(),
          title,
          description,
          platform,
          discoveryDate,
          ipfsCid,
          isActive,
          metadata: ipfsMetadata
        });
      } catch (error) {
        logger('getPaginatedAllVulnerabilities', 'warn', 'Skipping invalid entry', { 
          bvcId, error: error.message 
        });
      }
    }

    // Return formatted response with pagination metadata
    res.json({
      pagination: {
        page,
        pageSize,
        total: await blockchain.getTotalVulnerabilitiesCount()
      },
      count: formattedVulnerabilities.length,
      vulnerabilities: formattedVulnerabilities
    });

  } catch (error) {
    logger('getPaginatedAllVulnerabilities', 'error', 'Failed to retrieve', { 
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      error: 'Failed to retrieve paginated vulnerabilities',
      details: error.message
    });
  }
});

// GET /vulnerabilities/getPaginatedVulnerabilityIds
router.get('/getPaginatedVulnerabilityIds', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;
  
  logger('getPaginatedVulnerabilityIds', 'info', 'Request received', { page, pageSize });
  
  try {
    // Validate pagination parameters
    if (page < 1 || pageSize < 1) {
      logger('getPaginatedVulnerabilityIds', 'error', 'Invalid pagination parameters', { page, pageSize });
      return res.status(400).json({
        error: 'Invalid pagination parameters',
        details: 'Page and pageSize must be positive integers'
      });
    }
    
    // Use the blockchain service method to get paginated IDs
    logger('getPaginatedVulnerabilityIds', 'info', 'Fetching paginated vulnerability IDs', { page, pageSize });
    const bvcIds = await blockchain.getPaginatedVulnerabilityIds(page, pageSize);
    logger('getPaginatedVulnerabilityIds', 'info', `Retrieved ${bvcIds.length} vulnerability IDs for page ${page}`);
    
    // Since we now have built-in BVC IDs, we can return them directly
    logger('getPaginatedVulnerabilityIds', 'success', 'Successfully retrieved paginated vulnerability IDs');
    res.json({
      pagination: {
        page,
        pageSize,
        total: await blockchain.getTotalVulnerabilitiesCount()
      },
      bvcIds
    });
    
  } catch (error) {
    logger('getPaginatedVulnerabilityIds', 'error', 'Error fetching paginated vulnerability IDs', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'Failed to retrieve paginated vulnerability IDs',
      details: error.message
    });
  }
});

// GET /vulnerabilities/getAllVulnerabilityIds
router.get('/getAllVulnerabilityIds', async (req, res) => {
  logger('getAllVulnerabilityIds', 'info', 'Request received');
  
  try {
    // Get all vulnerability BVC IDs using the blockchain service
    const bvcIds = await blockchain.getAllBvcIds();
    logger('getAllVulnerabilityIds', 'info', `Retrieved ${bvcIds.length} vulnerability IDs`);
    
    logger('getAllVulnerabilityIds', 'success', 'Successfully retrieved vulnerability IDs');
    res.json({
      count: bvcIds.length,
      bvcIds
    });
    
  } catch (error) {
    logger('getAllVulnerabilityIds', 'error', 'Error fetching vulnerability IDs', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'Failed to retrieve vulnerability IDs',
      details: error.message
    });
  }
});

// GET /vulnerabilities/getVulnerabilityVersions/:id
router.get('/getVulnerabilityVersions/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    // Get all BVC IDs for this base vulnerability
    // Extract baseId from the BVC ID or use helper
    const baseIdBytes32 = id.startsWith('BVC-') ? generateBaseId(id) : id;

    // Call updated method that returns BVC IDs instead of version IDs
    const bvcIds = await blockchain.getVulnerabilityVersions(baseIdBytes32);
    const versions = [];

    for (const bvcId of bvcIds) {
      try {
        const versionData = await blockchain.getVulnerability(bvcId);
        const [, version, , title, description, ipfsCid, platform, discoveryDate, isActive] = versionData;
        
        versions.push({
          bvc_id: bvcId,
          version: version.toString(),
          title,
          description,
          ipfsCid,
          platform,
          discoveryDate,
          isActive
        });
      } catch (error) {
        logger('getVulnerabilityVersions', 'error', 'Skipping invalid version', { bvcId });
      }
    }

    res.json({ id, versions });

  } catch (error) {
    if (error.message.includes('does not exist')) {
      return res.status(404).json({ error: 'Vulnerability not found' });
    }
    res.status(500).json({ error: 'Failed to retrieve versions' });
  }
});

// POST /vulnerabilities/setVulnerabilityStatus
router.post('/setVulnerabilityStatus', async (req, res) => {
  try {
    const { id, isActive } = req.body;
    if (!id || typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'Invalid request parameters' });
    }

    // Extract baseId from BVC ID or use directly
    const baseIdBytes32 = id.startsWith('BVC-') ? generateBaseId(id) : id;
    const tx = await blockchain.setVulnerabilityStatus(baseIdBytes32, isActive);
    const receipt = await tx.wait();

    res.json({
      message: `Status updated to ${isActive ? 'active' : 'inactive'}`,
      txHash: tx.hash,
      block: receipt.blockNumber
    });

  } catch (error) {
    logger('setVulnerabilityStatus', 'error', 'Update failed', { error: error.message });
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// GET /vulnerabilities/validateDiscoveryDate
router.get('/validateDiscoveryDate', async (req, res) => {
  const { date } = req.query;
  
  if (!date) {
    return res.status(400).json({ error: 'Date parameter is required' });
  }
  
  try {
    const [isValid, errorMessage] = await blockchain.validateDiscoveryDate(date);
    
    if (isValid) {
      return res.json({ valid: true, year: await blockchain.extractYearFromDate(date) });
    } else {
      return res.status(400).json({ valid: false, error: errorMessage });
    }
  } catch (error) {
    logger('validateDiscoveryDate', 'error', 'Validation failed', { error: error.message });
    return res.status(500).json({ error: 'Failed to validate discovery date' });
  }
});

module.exports = router;