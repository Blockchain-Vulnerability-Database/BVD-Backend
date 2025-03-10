const express = require('express');
const router = express.Router();
const fs = require('fs');
const axios = require('axios');
const { ethers } = require('ethers');
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

    // Validate required fields
    const requiredFields = ['id', 'title', 'description', 'severity', 'platform'];
    const missingFields = requiredFields.filter(f => !vulnerabilityData[f]);
    if (missingFields.length > 0) {
      logger('addVulnerability', 'error', 'Missing fields', { missing: missingFields });
      return res.status(400).json({ error: 'Missing required fields', missing: missingFields });
    }

    // Upload to IPFS
    const fileBuffer = Buffer.from(JSON.stringify(vulnerabilityData, null, 2));
    const ipfsCid = await ipfs.uploadToIPFS(fileBuffer, `${vulnerabilityData.id}.json`);
    logger('addVulnerability', 'info', 'IPFS upload success', { cid: ipfsCid });

    // Generate blockchain ID
    const baseIdBytes32 = generateBaseId(vulnerabilityData.id);
    
    // Submit to blockchain
    const tx = await blockchain.addVulnerability(
      baseIdBytes32,
      vulnerabilityData.title,
      vulnerabilityData.description,
      ipfsCid,
      vulnerabilityData.platform
    );

    const receipt = await tx.wait();
    logger('addVulnerability', 'info', 'Blockchain confirmed', { 
      block: receipt.blockNumber,
      txHash: tx.hash 
    });

    res.status(201).json({
      message: 'Vulnerability recorded',
      identifiers: {
        text: vulnerabilityData.id,
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
    validateVulnerabilityId(id);
    const baseIdBytes32 = generateBaseId(id);

    try {
      const vulnerability = await blockchain.getVulnerability(baseIdBytes32);
      const [vulnId, version, baseId, title, description, ipfsCid, platform, isActive] = vulnerability;

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
        id,
        bytes32BaseId: baseId,
        title,
        description,
        platform,
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
    const allBaseIds = await blockchain.getAllBaseIds();
    if (!allBaseIds.length) return res.status(404).json({ error: 'No vulnerabilities found' });

    const vulnerabilities = [];
    for (const baseId of allBaseIds) {
      try {
        const vuln = await blockchain.getVulnerability(baseId);
        const [vulnId, version, , title, description, ipfsCid, platform, isActive] = vuln;

        let ipfsMetadata = null;
        let readableId = null; // Initialize a variable for the human-readable ID
        if (ipfsCid) {
          try {
            const response = await axios.get(`https://gateway.pinata.cloud/ipfs/${ipfsCid}`);
            ipfsMetadata = response.data;
            // Extract the human-readable ID from metadata if available
            readableId = ipfsMetadata.id || null;
          } catch (error) {
            logger('getAllVulnerabilities', 'warn', 'IPFS fetch failed', { cid: ipfsCid });
          }
        }

        vulnerabilities.push({
          id: readableId || vulnId, // Use the human-readable ID if available, otherwise use the blockchain ID
          vulnId, // Keep the blockchain-specific ID
          baseId, // Keep the base ID for reference
          version: version.toString(),
          title,
          description,
          platform,
          ipfsCid,
          isActive,
          metadata: ipfsMetadata
        });
      } catch (error) {
        logger('getAllVulnerabilities', 'error', 'Skipping invalid entry', { baseId });
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
    
    // Use the blockchain service to get paginated vulnerabilities with metadata
    const result = await blockchain.getPaginatedAllVulnerabilities(page, pageSize);
    
    if (!result.vulnerabilities.length) {
      return res.status(404).json({ error: 'No vulnerabilities found' });
    }
    
    // Format the vulnerabilities with their full data and IPFS metadata
    const formattedVulnerabilities = [];
    
    for (const item of result.vulnerabilities) {
      // Skip entries where we couldn't get data
      if (!item.data) continue;
      
      const [vulnId, version, , title, description, ipfsCid, platform, isActive] = item.data;
      
      let ipfsMetadata = null;
      let readableId = null;
      
      if (ipfsCid) {
        try {
          const response = await axios.get(`https://gateway.pinata.cloud/ipfs/${ipfsCid}`, 
            { timeout: 3000 });
          ipfsMetadata = response.data;
          // Extract the human-readable ID from metadata if available
          readableId = ipfsMetadata.id || null;
        } catch (error) {
          logger('getPaginatedAllVulnerabilities', 'warn', 'IPFS fetch failed', { 
            cid: ipfsCid,
            error: error.message 
          });
        }
      }
      
      formattedVulnerabilities.push({
        id: readableId || vulnId, // Use the human-readable ID if available, otherwise use the blockchain ID
        vulnId, // Keep the blockchain-specific ID
        baseId: item.baseId, // Keep the base ID for reference
        version: version.toString(),
        title,
        description,
        platform,
        ipfsCid,
        isActive,
        metadata: ipfsMetadata
      });
    }

    // Return formatted response with pagination metadata
    res.json({
      pagination: result.pagination,
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
      
      // Use the blockchain service method to get paginated IDs with metadata
      logger('getPaginatedVulnerabilityIds', 'info', 'Fetching paginated vulnerability IDs', { page, pageSize });
      const result = await blockchain.getPaginatedVulnerabilityIds(page, pageSize);
      logger('getPaginatedVulnerabilityIds', 'info', `Retrieved ${result.ids.length} vulnerability IDs for page ${page}`);
      
      // Process IDs to add text identifiers from IPFS where available
      const formattedIds = [];
      for (const item of result.ids) {
        // Try to find any IPFS metadata with the original text ID
        let textId = null;
        if (item.ipfsCid) {
          try {
            const ipfsResponse = await axios.get(
              `https://gateway.pinata.cloud/ipfs/${item.ipfsCid}`,
              { timeout: 2000 }
            );
            if (ipfsResponse.data && ipfsResponse.data.id) {
              textId = ipfsResponse.data.id;
            }
          } catch (ipfsError) {
            // Continue without IPFS data
          }
        }
        
        formattedIds.push({
          bytes32Id: item.bytes32Id,
          textId: textId,
          latestVersionId: item.latestVersionId
        });
      }
      
      logger('getPaginatedVulnerabilityIds', 'success', 'Successfully retrieved paginated vulnerability IDs');
      res.json({
        pagination: result.pagination,
        ids: formattedIds
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
      // Get vulnerability IDs with metadata using the blockchain service
      const vulnIdsWithMetadata = await blockchain.getAllVulnerabilityIds();
      logger('getAllVulnerabilityIds', 'info', `Retrieved ${vulnIdsWithMetadata.length} vulnerability IDs`);
      
      // Add text identifiers from IPFS where available
      const formattedIds = [];
      
      for (const item of vulnIdsWithMetadata) {
        // Try to find the text ID from IPFS metadata
        let textId = null;
        
        if (item.ipfsCid) {
          try {
            const ipfsResponse = await axios.get(
              `https://gateway.pinata.cloud/ipfs/${item.ipfsCid}`,
              { timeout: 2000 }
            );
            
            if (ipfsResponse.data && ipfsResponse.data.id) {
              textId = ipfsResponse.data.id;
            }
          } catch (ipfsError) {
            // Continue without IPFS data
          }
        }
        
        formattedIds.push({
          bytes32Id: item.bytes32Id,
          textId: textId,
          latestVersionId: item.latestVersionId
        });
      }
      
      logger('getAllVulnerabilityIds', 'success', 'Successfully retrieved vulnerability IDs');
      res.json({
        count: formattedIds.length,
        ids: formattedIds
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
    validateVulnerabilityId(id);
    const baseIdBytes32 = generateBaseId(id);

    const versionIds = await blockchain.getVulnerabilityVersions(baseIdBytes32);
    const versions = [];

    for (let i = 0; i < versionIds.length; i++) {
      try {
        const versionData = await blockchain.getVulnerabilityByVersion(baseIdBytes32, i + 1);
        const [vulnId, version, , title, description, ipfsCid, platform, isActive] = versionData;
        
        versions.push({
          version: version.toString(),
          title,
          description,
          ipfsCid,
          platform,
          isActive
        });
      } catch (error) {
        logger('getVulnerabilityVersions', 'error', 'Skipping invalid version', { version: i + 1 });
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

// GET /vulnerabilities/getVulnerabilityByVersion/:id/:version
router.get('/getVulnerabilityByVersion/:id/:version', async (req, res) => {
  const { id, version } = req.params;
  
  try {
    validateVulnerabilityId(id);
    const versionNum = parseVersion(version);
    const baseIdBytes32 = generateBaseId(id);

    const vulnerability = await blockchain.getVulnerabilityByVersion(baseIdBytes32, versionNum);
    const [vulnId, vulnVersion, , title, description, ipfsCid, platform, isActive] = vulnerability;

    let ipfsData = null;
    if (ipfsCid) {
      try {
        const response = await axios.get(`https://gateway.pinata.cloud/ipfs/${ipfsCid}`);
        ipfsData = response.data;
      } catch (error) {
        logger('getVulnerabilityByVersion', 'warn', 'IPFS fetch failed', { cid: ipfsCid });
      }
    }

    res.json({
      id,
      version: vulnVersion.toString(),
      title,
      description,
      platform,
      status: isActive ? 'active' : 'inactive',
      ipfs: {
        cid: ipfsCid,
        data: ipfsData
      }
    });

  } catch (error) {
    if (error.message.includes('does not exist')) {
      return res.status(404).json({ error: 'Version not found' });
    }
    res.status(500).json({ error: 'Failed to retrieve version' });
  }
});

// POST /vulnerabilities/setVulnerabilityStatus
router.post('/setVulnerabilityStatus', async (req, res) => {
  try {
    const { id, isActive } = req.body;
    if (!id || typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'Invalid request parameters' });
    }

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

module.exports = router;