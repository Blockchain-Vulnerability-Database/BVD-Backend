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

// GET /vulnerabilities/preGenerateBvcId
router.get('/preGenerateBvcId', async (req, res) => {
  const { platform, discoveryDate } = req.query;
  logger('preGenerateBvcId', 'info', 'Request received', { platform, discoveryDate });
  
  try {
    // Validate platform format (2-5 uppercase letters)
    const platformRegex = /^[A-Z]{2,5}$/;
    if (!platformRegex.test(platform)) {
      logger('preGenerateBvcId', 'error', 'Invalid platform format', { platform });
      return res.status(400).json({ 
        error: 'Invalid platform format', 
        details: 'Platform must be 2-5 uppercase letters (e.g., ETH, SOL, MULTI)' 
      });
    }

    // Validate discoveryDate format
    const dateRegex = /^(\d{4}(-\d{2}-\d{2})?)$/;
    if (!dateRegex.test(discoveryDate)) {
      logger('preGenerateBvcId', 'error', 'Invalid discoveryDate format', { discoveryDate });
      return res.status(400).json({
        error: 'Invalid discoveryDate format',
        details: 'discoveryDate must be in YYYY-MM-DD or YYYY format'
      });
    }

    // Call the new contract method to pre-generate the BVC ID
    const bvcId = await blockchain.preGenerateBvcId(platform, discoveryDate);
    
    logger('preGenerateBvcId', 'info', 'BVC ID pre-generated', { bvcId, platform, discoveryDate });
    
    res.json({
      bvcId,
      platform,
      discoveryDate
    });

  } catch (error) {
    logger('preGenerateBvcId', 'error', 'Failed to pre-generate BVC ID', { 
      error: error.message,
      stack: error.stack 
    });
    
    res.status(500).json({
      error: 'Failed to pre-generate BVC ID',
      details: error.message
    });
  }
});

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
    
    // Pre-generate the BVC ID before submitting to the blockchain
    let preBvcId = null;
    try {
      preBvcId = await blockchain.preGenerateBvcId(
        vulnerabilityData.platform, 
        vulnerabilityData.discoveryDate
      );
      logger('addVulnerability', 'info', 'Pre-generated BVC ID', { preBvcId });
    } catch (preGenError) {
      logger('addVulnerability', 'warn', 'Failed to pre-generate BVC ID', { error: preGenError.message });
      // Continue with the process - we'll use the generated ID from the event later
    }

    // Always use BVC ID format for IPFS filename, even if pre-generation fails
    let ipfsFilename;
    if (preBvcId) {
      ipfsFilename = `${preBvcId}.json`;
    } else {
      // Manually construct BVC ID format
      const year = vulnerabilityData.discoveryDate.substring(0, 4);
      
      // Get current timestamp for uniqueness if needed
      const timestamp = Date.now().toString().substring(6);
      
      ipfsFilename = `BVC-${vulnerabilityData.platform}-${year}-001-${timestamp}.json`;
      logger('addVulnerability', 'info', 'Using manually constructed BVC ID format', { ipfsFilename });
    }
    
    // Upload to IPFS with the BVC ID filename
    const fileBuffer = Buffer.from(JSON.stringify(vulnerabilityData, null, 2));
    const ipfsCid = await ipfs.uploadToIPFS(fileBuffer, ipfsFilename);
    logger('addVulnerability', 'info', 'IPFS upload success', { cid: ipfsCid, filename: ipfsFilename });

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
    
    // Extract or create technical details
    const technicalDetails = vulnerabilityData.technicalDetails || {
      severity: "Medium",
      affectedSyntax: ["Solidity"],
      vulnerableVersions: ["*"],
      attackVectors: ["Unknown"],
      affectedChains: [vulnerabilityData.platform],
      codeExamples: []
    };
    
    // Extract or create proof of exploit
    const proofOfExploit = vulnerabilityData.proofOfExploit || {
      attackVector: "Not provided",
      stepsToReproduce: ["Not provided"],
      exploitCode: {
        language: "None",
        code: "Not provided"
      },
      remediation: ""
    };
    
    // Determine if we have a proof of exploit
    const hasProofOfExploit = !!vulnerabilityData.proofOfExploit;
    
    // Submit to blockchain with all required parameters
    const tx = await blockchain.addVulnerability(
      baseIdBytes32,
      vulnerabilityData.title,
      vulnerabilityData.description,
      ipfsCid,
      vulnerabilityData.platform,
      vulnerabilityData.discoveryDate,
      technicalDetails,
      proofOfExploit,
      hasProofOfExploit
    );

    const receipt = await tx.wait();
    
    // Get the BVC ID from the transaction receipt
    let bvcId = preBvcId; // Use the pre-generated ID if available
    try {
      // If we didn't pre-generate, extract BVC ID from event logs
      if (!bvcId) {
        // Try first the BvcIdGenerated event (new)
        const bvcIdEvents = await blockchain.getEventsFromReceipt(receipt, 'BvcIdGenerated');
        if (bvcIdEvents && bvcIdEvents.length > 0) {
          bvcId = bvcIdEvents[0].args.bvc_id;
        } else {
          // Fall back to VulnerabilityRegistered event (old)
          const regEvents = await blockchain.getEventsFromReceipt(receipt, 'VulnerabilityRegistered');
          if (regEvents && regEvents.length > 0) {
            bvcId = regEvents[0].args.bvc_id;
          }
        }
      }
      
      // If we got a BVC ID and it doesn't match our pre-generated one or manually generated one,
      // we need to rename the IPFS file
      if (bvcId && bvcId !== ipfsFilename.replace('.json', '')) {
        logger('addVulnerability', 'warn', 'BVC ID mismatch - need to reupload to IPFS', { 
          usedFilename: ipfsFilename,
          actualBvcId: bvcId 
        });
        
        // Re-upload with correct BVC ID filename
        const newIpfsCid = await ipfs.uploadToIPFS(fileBuffer, `${bvcId}.json`);
        logger('addVulnerability', 'info', 'IPFS re-upload success', { cid: newIpfsCid, filename: `${bvcId}.json` });
        
        // Update the IPFS CID in the blockchain (might need a separate contract function)
        // For now, we'll just log the discrepancy and return both CIDs
        ipfsCid = newIpfsCid;
      }
    } catch (eventError) {
      logger('addVulnerability', 'warn', 'Failed to extract or process BVC ID from events', { 
        error: eventError.message 
      });
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
        url: `https://gateway.pinata.cloud/ipfs/${ipfsCid}`,
        filename: bvcId ? `${bvcId}.json` : ipfsFilename
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
      
      // Updated to handle the new return values - 11 items now instead of 9
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
        
        // Updated to handle the new return values - 11 items now instead of 9
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
        
        // Updated to handle the new return values - 11 items now instead of 9
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
        
        // Updated to handle the new return values - 11 items now instead of 9
        const [
          , // bvc_id (already have it)
          version, 
          , // baseId (already have it)
          titleHash, 
          descriptionHash, 
          ipfsCid, 
          platform, 
          discoveryDate, 
          technicalDetailsHash, 
          proofOfExploitHash, 
          isActive
        ] = versionData;
        
        versions.push({
          bvc_id: bvcId,
          version: version.toString(),
          titleHash,
          descriptionHash,
          ipfsCid,
          platform,
          discoveryDate,
          technicalDetailsHash,
          proofOfExploitHash,
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

// POST /vulnerabilities/verifyTechnicalDetails
router.post('/verifyTechnicalDetails', async (req, res) => {
  try {
    const { bvcId, technicalDetails } = req.body;
    
    if (!bvcId || !technicalDetails) {
      return res.status(400).json({ error: 'BVC ID and technical details are required' });
    }
    
    const result = await blockchain.verifyTechnicalDetails(bvcId, technicalDetails);
    res.json({ matches: result });
  } catch (error) {
    logger('verifyTechnicalDetails', 'error', 'Verification failed', { error: error.message });
    res.status(500).json({ error: 'Failed to verify technical details', details: error.message });
  }
});

// POST /vulnerabilities/verifyProofOfExploit
router.post('/verifyProofOfExploit', async (req, res) => {
  try {
    const { bvcId, proofOfExploit } = req.body;
    
    if (!bvcId || !proofOfExploit) {
      return res.status(400).json({ error: 'BVC ID and proof of exploit are required' });
    }
    
    const result = await blockchain.verifyProofOfExploit(bvcId, proofOfExploit);
    res.json({ matches: result });
  } catch (error) {
    logger('verifyProofOfExploit', 'error', 'Verification failed', { error: error.message });
    res.status(500).json({ error: 'Failed to verify proof of exploit', details: error.message });
  }
});

module.exports = router;