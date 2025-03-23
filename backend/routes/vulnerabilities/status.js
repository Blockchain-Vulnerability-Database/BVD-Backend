const express = require('express');
const router = express.Router();
const { logger } = require('../../services/logger');
const blockchain = require('../../services/blockchain');
const { generateBaseId } = require('../../utils/helpers');

/**
 * POST /vulnerabilities/status/set
 * Update the active status of a vulnerability
 */
const setVulnerabilityStatus = async (req, res) => {
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
};

// Define routes for the new structure
router.post('/set', setVulnerabilityStatus);

// Export both the router and the controller functions
router.setVulnerabilityStatus = setVulnerabilityStatus;

module.exports = router;