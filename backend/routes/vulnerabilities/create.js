const express = require('express');
const router = express.Router();
const fs = require('fs');
const crypto = require('crypto');
const { logger } = require('../../services/logger');
const blockchain = require('../../services/blockchain');
const ipfs = require('../../services/ipfs');
const { generateBaseId } = require('../../utils/helpers');

/**
 * GET /vulnerabilities/create/preGenerate
 * Pre-generates a BVC ID based on platform and discovery date
 */
const preGenerateBvcId = async (req, res) => {
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

    // Call the contract method to pre-generate the BVC ID
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
};

/**
 * POST /vulnerabilities/create/add
 * Adds a new vulnerability to the registry
 */
const addVulnerability = async (req, res) => {
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
};

// Define routes for the new structure
router.get('/preGenerate', preGenerateBvcId);
router.post('/add', addVulnerability);

// Export both the router and the controller functions
router.preGenerateBvcId = preGenerateBvcId;
router.addVulnerability = addVulnerability;

module.exports = router;