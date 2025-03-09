const { ethers } = require('ethers');
const { logger } = require('./logger');
const { contractConfig } = require('../config');

const handleContractError = (error, context = '') => {
  logger('blockchain', 'error', `Contract error ${context}`, { 
    message: error.message,
    code: error.code,
    stack: error.stack 
  });
  
  let message = error.message;
  if (error.info?.error?.data) {
    try {
      const decodedError = contractConfig.contract.interface.parseError(error.info.error.data);
      message = decodedError?.name || message;
    } catch (_) {}
  }
  
  throw new Error(message);
};

const getVulnerability = async (baseIdBytes32) => {
  try {
    return await contractConfig.contract.getLatestVulnerability(baseIdBytes32);
  } catch (error) {
    return handleContractError(error, 'getVulnerability');
  }
};

const addVulnerability = async (baseIdBytes32, title, description, ipfsCid, platform) => {
  try {
    const tx = await contractConfig.contract.addVulnerability(
      baseIdBytes32,
      title,
      description,
      ipfsCid,
      platform
    );
    
    logger('blockchain', 'info', 'Transaction submitted', {
      baseId: baseIdBytes32,
      txHash: tx.hash
    });
    
    return tx;
  } catch (error) {
    return handleContractError(error, 'addVulnerability');
  }
};

const getAllBaseIds = async () => {
  try {
    return await contractConfig.contract.getAllBaseVulnerabilityIds();
  } catch (error) {
    return handleContractError(error, 'getAllBaseIds');
  }
};

const getVulnerabilityVersions = async (baseIdBytes32) => {
  try {
    return await contractConfig.contract.getVulnerabilityVersions(baseIdBytes32);
  } catch (error) {
    return handleContractError(error, 'getVulnerabilityVersions');
  }
};

const getVulnerabilityByVersion = async (baseIdBytes32, versionNumber) => {
  try {
    return await contractConfig.contract.getVulnerabilityByVersion(baseIdBytes32, versionNumber);
  } catch (error) {
    return handleContractError(error, 'getVulnerabilityByVersion');
  }
};

const setVulnerabilityStatus = async (baseIdBytes32, isActive) => {
  try {
    const tx = await contractConfig.contract.setVulnerabilityStatus(baseIdBytes32, isActive);
    logger('blockchain', 'info', 'Status update submitted', {
      baseId: baseIdBytes32,
      txHash: tx.hash
    });
    return tx;
  } catch (error) {
    return handleContractError(error, 'setVulnerabilityStatus');
  }
};

const getPaginatedIds = async (page, pageSize) => {
  try {
    return await contractConfig.contract.getPaginatedBaseVulnerabilityIds(page, pageSize);
  } catch (error) {
    return handleContractError(error, 'getPaginatedIds');
  }
};

const getVulnerabilityDetails = async (versionId) => {
  try {
    return await contractConfig.contract.vulnerabilities(versionId);
  } catch (error) {
    return handleContractError(error, 'getVulnerabilityDetails');
  }
};

const getLatestVersionId = async (baseIdBytes32) => {
  try {
    return await contractConfig.contract.latestVersions(baseIdBytes32);
  } catch (error) {
    return handleContractError(error, 'getLatestVersionId');
  }
};

/**
 * Gets basic metadata for all vulnerability IDs
 * 
 * @returns {Promise<Array>} Array of vulnerability ID objects
 */
const getAllVulnerabilityIds = async () => {
  try {
    // Get all base IDs from the contract
    const baseIds = await getAllBaseIds();
    
    // For each ID, get the latest version ID and IPFS CID
    const idsWithMetadata = [];
    
    for (const baseId of baseIds) {
      try {
        // Get the latest version ID for this base ID
        const latestVersionId = await getLatestVersionId(baseId);
        
        // Get the vulnerability details
        const details = await getVulnerabilityDetails(latestVersionId);
        
        idsWithMetadata.push({
          bytes32Id: baseId,
          latestVersionId: latestVersionId,
          ipfsCid: details.ipfsCid || null
        });
      } catch (error) {
        // If we can't get details, just include the base ID
        idsWithMetadata.push({
          bytes32Id: baseId,
          latestVersionId: null,
          ipfsCid: null
        });
      }
    }
    
    return idsWithMetadata;
  } catch (error) {
    return handleContractError(error, 'getAllVulnerabilityIds');
  }
};

/**
 * Gets paginated vulnerability IDs with basic metadata
 * 
 * @param {number} page - Page number (1-based)
 * @param {number} pageSize - Number of items per page
 * @returns {Promise<Object>} Object with pagination info and vulnerability ID data
 */
const getPaginatedVulnerabilityIds = async (page, pageSize) => {
  try {
    // Get paginated IDs
    const paginatedIds = await getPaginatedIds(page, pageSize);
    
    // Get total count for pagination metadata
    const allIds = await getAllBaseIds();
    const totalCount = allIds.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    
    // For each ID, get the latest version ID and IPFS CID
    const idsWithMetadata = [];
    
    for (const baseId of paginatedIds) {
      try {
        // Get the latest version ID for this base ID
        const latestVersionId = await getLatestVersionId(baseId);
        
        // Get the vulnerability details
        const details = await getVulnerabilityDetails(latestVersionId);
        
        idsWithMetadata.push({
          bytes32Id: baseId,
          latestVersionId: latestVersionId,
          ipfsCid: details.ipfsCid || null
        });
      } catch (error) {
        // If we can't get details, just include the base ID
        idsWithMetadata.push({
          bytes32Id: baseId,
          latestVersionId: null,
          ipfsCid: null
        });
      }
    }
    
    return {
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      ids: idsWithMetadata
    };
  } catch (error) {
    return handleContractError(error, 'getPaginatedVulnerabilityIds');
  }
};

module.exports = {
  addVulnerability,
  getVulnerability,
  getAllBaseIds,
  getVulnerabilityVersions,
  getVulnerabilityByVersion,
  setVulnerabilityStatus,
  getPaginatedIds,
  getVulnerabilityDetails,
  getLatestVersionId,
  getAllVulnerabilityIds,
  getPaginatedVulnerabilityIds,
  contractInstance: contractConfig.contract,
  provider: contractConfig.provider
};