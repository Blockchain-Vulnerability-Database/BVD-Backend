const { ethers } = require('ethers');

module.exports = {
  generateBaseId: (textId) => ethers.keccak256(ethers.toUtf8Bytes(textId)),
  
  validateVulnerabilityId: (id) => {
    if (!/^BVC-[A-Z]{3}-\d{3}$/.test(id)) {
      throw new Error('Invalid ID format');
    }
  },

  parseVersion: (version) => {
    const versionNum = parseInt(version);
    if (isNaN(versionNum)) throw new Error('Invalid version number');
    return versionNum;
  }
};