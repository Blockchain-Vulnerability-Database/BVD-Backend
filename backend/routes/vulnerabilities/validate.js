const express = require('express');
const router = express.Router();
const { logger } = require('../../services/logger');
const blockchain = require('../../services/blockchain');

/**
 * GET /vulnerabilities/validate/discoveryDate
 * Validate a discovery date string
 */
const validateDiscoveryDate = async (req, res) => {
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
};

/**
 * POST /vulnerabilities/validate/technicalDetails
 * Verify technical details against a stored hash
 */
const verifyTechnicalDetails = async (req, res) => {
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
};

/**
 * POST /vulnerabilities/validate/proofOfExploit
 * Verify proof of exploit against a stored hash
 */
const verifyProofOfExploit = async (req, res) => {
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
};

// Define routes for the new structure
router.get('/discoveryDate', validateDiscoveryDate);
router.post('/technicalDetails', verifyTechnicalDetails);
router.post('/proofOfExploit', verifyProofOfExploit);

// Export both the router and the controller functions
router.validateDiscoveryDate = validateDiscoveryDate;
router.verifyTechnicalDetails = verifyTechnicalDetails;
router.verifyProofOfExploit = verifyProofOfExploit;

module.exports = router;