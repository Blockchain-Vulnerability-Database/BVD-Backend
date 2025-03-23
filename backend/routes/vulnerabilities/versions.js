const express = require('express');
const router = express.Router();
const { logger } = require('../../services/logger');
const blockchain = require('../../services/blockchain');
const { generateBaseId } = require('../../utils/helpers');

/**
 * GET /vulnerabilities/versions/get/:id
 * Get all versions of a vulnerability by its ID
 */
const getVulnerabilityVersions = async (req, res) => {
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
        
        // Handle the new return values - 11 items
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
};

// Define routes for the new structure
router.get('/get/:id', getVulnerabilityVersions);

// Export both the router and the controller functions
router.getVulnerabilityVersions = getVulnerabilityVersions;

module.exports = router;