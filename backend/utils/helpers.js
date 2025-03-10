const { ethers } = require('ethers');

module.exports = {
  generateBaseId: (textId) => ethers.keccak256(ethers.toUtf8Bytes(textId)),
  
  validateVulnerabilityId: (id) => {
    // Update regex to match the new format: BVC-[A-Z]{2,5}-\d{4}-\d{3,5}
    if (!/^BVC-[A-Z]{2,5}-\d{4}-\d{3,5}$/.test(id)) {
      throw new Error('Invalid ID format. Expected format: BVC-PLATFORM-YEAR-ID (e.g., BVC-ETH-2023-001)');
    }
  },

  parseVersion: (version) => {
    const versionNum = parseInt(version);
    if (isNaN(versionNum)) throw new Error('Invalid version number');
    return versionNum;
  },
  
  // Helper to extract platform from BVC ID
  extractPlatformFromBvcId: (bvcId) => {
    const match = bvcId.match(/^BVC-([A-Z]{2,5})-\d{4}-\d{3,5}$/);
    return match ? match[1] : null;
  },
  
  // Helper to extract year from BVC ID
  extractYearFromBvcId: (bvcId) => {
    const match = bvcId.match(/^BVC-[A-Z]{2,5}-(\d{4})-\d{3,5}$/);
    return match ? parseInt(match[1]) : null;
  },
  
  // Helper to extract entry ID from BVC ID
  extractEntryIdFromBvcId: (bvcId) => {
    const match = bvcId.match(/^BVC-[A-Z]{2,5}-\d{4}-(\d{3,5})$/);
    return match ? parseInt(match[1]) : null;
  }
};