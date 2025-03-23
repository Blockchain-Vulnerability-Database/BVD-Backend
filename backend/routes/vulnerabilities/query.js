const express = require('express');
const router = express.Router();
const axios = require('axios');
const { logger } = require('../../services/logger');
const blockchain = require('../../services/blockchain');

/**
 * GET /vulnerabilities/query/byId/:id
 * Get a vulnerability by its BVC ID
 */
const getVulnerability = async (req, res) => {
  const { id } = req.params;
  logger('getVulnerability', 'info', 'Request received', { id });
  
  try {
    try {
      // Call the blockchain method that uses BVC ID string directly
      const vulnerability = await blockchain.getVulnerability(id);
      
      // Handle the new return values - 11 items
      const [
        bvc_id, 
        version, 
        baseId, 
        titleHash, 
        descriptionHash, 
        ipfsCid, 
        platform, 
        discoveryDate, 
        technicalDetailsHash, 
        proofOfExploitHash, 
        isActive
      ] = vulnerability;

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
        titleHash,
        descriptionHash,
        platform,
        discoveryDate,
        version: version.toString(),
        status: isActive ? 'active' : 'inactive',
        technicalDetailsHash,
        proofOfExploitHash,
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
};

/**
 * GET /vulnerabilities/query/all
 * Get all vulnerabilities
 */
const getAllVulnerabilities = async (req, res) => {
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
        
        // Handle the return values - 11 items
        const [
          bvc_id, 
          version, 
          baseId, 
          titleHash, 
          descriptionHash, 
          ipfsCid, 
          platform, 
          discoveryDate, 
          technicalDetailsHash, 
          proofOfExploitHash, 
          isActive
        ] = vuln;

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
          titleHash,
          descriptionHash,
          platform,
          discoveryDate,
          ipfsCid,
          technicalDetailsHash,
          proofOfExploitHash,
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
};

/**
 * GET /vulnerabilities/query/paginated
 * Get paginated vulnerabilities with full data
 */
const getPaginatedAllVulnerabilities = async (req, res) => {
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
    
    // Use the blockchain service to get paginated vulnerabilities
    const bvcIds = await blockchain.getPaginatedVulnerabilityIds(page, pageSize);
    
    if (!bvcIds || !bvcIds.length) {
      return res.status(404).json({ error: 'No vulnerabilities found for this page' });
    }
    
    // Format the vulnerabilities with their full data and IPFS metadata
    const formattedVulnerabilities = [];
    
    for (const bvcId of bvcIds) {
      try {
        const vuln = await blockchain.getVulnerability(bvcId);
        
        // Handle the return values - 11 items
        const [
          bvc_id, 
          version, 
          baseId, 
          titleHash, 
          descriptionHash, 
          ipfsCid, 
          platform, 
          discoveryDate, 
          technicalDetailsHash, 
          proofOfExploitHash, 
          isActive
        ] = vuln;
        
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
          titleHash,
          descriptionHash,
          platform,
          discoveryDate,
          ipfsCid,
          technicalDetailsHash,
          proofOfExploitHash,
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
};

/**
 * GET /vulnerabilities/query/paginatedIds
 * Get paginated vulnerability IDs
 */
const getPaginatedVulnerabilityIds = async (req, res) => {
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
    
    // Return BVC IDs directly
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
};

/**
 * GET /vulnerabilities/query/byPlatform
 * Get all vulnerabilities for a specific platform
 */
const getAllVulnerabilitiesByPlatform = async (req, res) => {
  const { platform } = req.query;
  
  logger('getAllVulnerabilitiesByPlatform', 'info', 'Request received', { platform });
  
  try {
    // Validate platform format (2-5 uppercase letters)
    const platformRegex = /^[A-Z]{2,5}$/;
    if (!platformRegex.test(platform)) {
      logger('getAllVulnerabilitiesByPlatform', 'error', 'Invalid platform format', { platform });
      return res.status(400).json({ 
        error: 'Invalid platform format', 
        details: 'Platform must be 2-5 uppercase letters (e.g., ETH, SOL, MULTI)' 
      });
    }
    
    // Get all vulnerabilities for the specified platform
    const bvcIds = await blockchain.getAllVulnerabilitiesByPlatform(platform);
    
    // Format the vulnerabilities with their full data
    const vulnerabilities = [];
    
    for (const bvcId of bvcIds) {
      try {
        const vuln = await blockchain.getVulnerability(bvcId);
        
        // Handle the return values - 11 items
        const [
          bvc_id, 
          version, 
          baseId, 
          titleHash, 
          descriptionHash, 
          ipfsCid, 
          platform, 
          discoveryDate, 
          technicalDetailsHash, 
          proofOfExploitHash, 
          isActive
        ] = vuln;
        
        let ipfsMetadata = null;
        
        if (ipfsCid) {
          try {
            const response = await axios.get(`https://gateway.pinata.cloud/ipfs/${ipfsCid}`, 
              { timeout: 3000 });
            ipfsMetadata = response.data;
          } catch (error) {
            logger('getAllVulnerabilitiesByPlatform', 'warn', 'IPFS fetch failed', { 
              cid: ipfsCid,
              error: error.message 
            });
          }
        }
        
        vulnerabilities.push({
          bvc_id,
          baseId,
          version: version.toString(),
          titleHash,
          descriptionHash,
          platform,
          discoveryDate,
          ipfsCid,
          technicalDetailsHash,
          proofOfExploitHash,
          isActive,
          metadata: ipfsMetadata
        });
      } catch (error) {
        logger('getAllVulnerabilitiesByPlatform', 'warn', 'Skipping invalid entry', { 
          bvcId, error: error.message 
        });
      }
    }
    
    logger('getAllVulnerabilitiesByPlatform', 'success', 'Successfully retrieved platform vulnerabilities');
    res.json({
      platform,
      count: vulnerabilities.length,
      vulnerabilities
    });
    
  } catch (error) {
    logger('getAllVulnerabilitiesByPlatform', 'error', 'Error fetching platform vulnerabilities', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'Failed to retrieve platform vulnerabilities',
      details: error.message
    });
  }
};

/**
 * GET /vulnerabilities/query/allIds
 * Get all vulnerability IDs
 */
const getAllVulnerabilityIds = async (req, res) => {
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
};

// Define routes for the new structure
router.get('/byId/:id', getVulnerability);
router.get('/all', getAllVulnerabilities);
router.get('/paginated', getPaginatedAllVulnerabilities);
router.get('/paginatedIds', getPaginatedVulnerabilityIds);
router.get('/byPlatform', getAllVulnerabilitiesByPlatform);
router.get('/allIds', getAllVulnerabilityIds);

// Export both the router and the controller functions
router.getVulnerability = getVulnerability;
router.getAllVulnerabilities = getAllVulnerabilities;
router.getPaginatedAllVulnerabilities = getPaginatedAllVulnerabilities;
router.getPaginatedVulnerabilityIds = getPaginatedVulnerabilityIds;
router.getAllVulnerabilitiesByPlatform = getAllVulnerabilitiesByPlatform;
router.getAllVulnerabilityIds = getAllVulnerabilityIds;

module.exports = router;