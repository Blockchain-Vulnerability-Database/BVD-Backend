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

/**
 * Pre-generates a BVC ID based on platform and discovery date
 * This allows getting the BVC ID before submitting to the blockchain
 * @param {string} platform - Platform code (e.g., "ETH", "SOL")
 * @param {string} discoveryDate - Discovery date in YYYY-MM-DD or YYYY format
 * @returns {Promise<string>} The pre-generated BVC ID
 */
const preGenerateBvcId = async (platform, discoveryDate) => {
  try {
    // Validate platform format and discovery date before calling contract
    // This prevents unnecessary contract calls that would fail
    const platformRegex = /^[A-Z]{2,5}$/;
    if (!platformRegex.test(platform)) {
      throw new Error('Platform must be 2-5 uppercase letters (e.g., ETH, SOL, MULTI)');
    }

    const dateRegex = /^(\d{4}(-\d{2}-\d{2})?)$/;
    if (!dateRegex.test(discoveryDate)) {
      throw new Error('Discovery date must be in YYYY-MM-DD or YYYY format');
    }

    // Call the new contract method to pre-generate the BVC ID
    const bvcId = await contractConfig.contract.preGenerateBvcId(platform, discoveryDate);
    
    logger('blockchain', 'info', 'BVC ID pre-generated', {
      platform,
      discoveryDate,
      bvcId
    });
    
    return bvcId;
  } catch (error) {
    return handleContractError(error, 'preGenerateBvcId');
  }
};

const getVulnerability = async (bvcId) => {
  try {
    return await contractConfig.contract.getVulnerability(bvcId);
  } catch (error) {
    return handleContractError(error, 'getVulnerability');
  }
};

/**
 * Add a vulnerability to the registry
 * @param {string} baseIdBytes32 - Base ID for the vulnerability
 * @param {string} title - Title of the vulnerability
 * @param {string} description - Description of the vulnerability
 * @param {string} ipfsCid - IPFS content identifier
 * @param {string} platform - Platform code (e.g., "ETH", "SOL")
 * @param {string} discoveryDate - Discovery date in YYYY-MM-DD or YYYY format
 * @param {Object} technicalDetails - Technical details about the vulnerability
 * @param {Object} proofOfExploit - Optional proof of exploit
 * @param {boolean} hasProofOfExploit - Flag indicating if proof of exploit is provided
 * @returns {Promise<Object>} Transaction object
 */
const addVulnerability = async (
  baseIdBytes32, 
  title, 
  description, 
  ipfsCid, 
  platform, 
  discoveryDate,
  technicalDetails,
  proofOfExploit,
  hasProofOfExploit
) => {
  try {
    // Validate that discoveryDate is provided and not empty
    if (!discoveryDate) {
      throw new Error('discoveryDate is required for vulnerability submissions');
    }
    
    // Validate discoveryDate format
    const isValid = await validateDiscoveryDate(discoveryDate);
    if (!isValid[0]) {
      throw new Error(`Invalid discoveryDate: ${isValid[1]}`);
    }
    
    // Create default values for new parameters if not provided
    const defaultTechnicalDetails = {
      severity: "Medium",
      affectedSyntax: ["Solidity"],
      vulnerableVersions: ["*"],
      attackVectors: ["Unknown"],
      affectedChains: [platform],
      codeExamples: []
    };
    
    const defaultProofOfExploit = {
      attackVector: "Not provided",
      stepsToReproduce: ["Not provided"],
      exploitCode: {
        language: "None",
        code: "Not provided"
      },
      remediation: ""
    };
    
    const tx = await contractConfig.contract.addVulnerability(
      baseIdBytes32,
      title,
      description,
      ipfsCid,
      platform,
      discoveryDate,
      technicalDetails || defaultTechnicalDetails,
      proofOfExploit || defaultProofOfExploit,
      hasProofOfExploit || false
    );
    
    logger('blockchain', 'info', 'Transaction submitted', {
      baseId: baseIdBytes32,
      txHash: tx.hash,
      discoveryDate: discoveryDate
    });
    
    return tx;
  } catch (error) {
    return handleContractError(error, 'addVulnerability');
  }
};

/**
 * Validate a discovery date string (JavaScript implementation)
 * @param {string} discoveryDate - Date string in format YYYY-MM-DD or YYYY
 * @returns {Promise<Array>} [isValid, errorMessage]
 */
const validateDiscoveryDate = async (discoveryDate) => {
  try {
    // JavaScript implementation of the validation logic
    if (!discoveryDate) {
      return [false, "Discovery date cannot be empty"];
    }

    // Check YYYY format
    if (discoveryDate.length === 4) {
      const yearRegex = /^\d{4}$/;
      if (!yearRegex.test(discoveryDate)) {
        return [false, "Year must contain only digits"];
      }
      
      const year = parseInt(discoveryDate);
      if (year < 1990 || year > 9999) {
        return [false, "Year must be between 1990 and 9999"];
      }
      
      return [true, ""];
    }
    
    // Check YYYY-MM-DD format
    if (discoveryDate.length === 10) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(discoveryDate)) {
        return [false, "Discovery date must be in YYYY-MM-DD format"];
      }
      
      const [yearStr, monthStr, dayStr] = discoveryDate.split('-');
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);
      const day = parseInt(dayStr);
      
      if (year < 1990 || year > 9999) {
        return [false, "Year must be between 1990 and 9999"];
      }
      
      if (month < 1 || month > 12) {
        return [false, "Month must be between 1 and 12"];
      }
      
      if (day < 1 || day > 31) {
        return [false, "Day must be between 1 and 31"];
      }
      
      // Simplified validation for month/day combinations
      if (month === 2 && day > 29) {
        return [false, "February has at most 29 days"];
      }
      
      if ([4, 6, 9, 11].includes(month) && day > 30) {
        return [false, "This month has at most 30 days"];
      }
      
      return [true, ""];
    }
    
    return [false, "Discovery date must be in YYYY or YYYY-MM-DD format"];
  } catch (error) {
    logger('blockchain', 'error', 'Date validation error', { error: error.message });
    return [false, error.message];
  }
};

/**
 * Extract events from a transaction receipt
 * @param {Object} receipt - Transaction receipt
 * @param {string} eventName - Name of the event to look for
 * @returns {Array} Array of event objects
 */
const getEventsFromReceipt = async (receipt, eventName) => {
  try {
    // Parse the logs using contract interface
    const events = [];
    for (const log of receipt.logs) {
      try {
        const parsedLog = contractConfig.contract.interface.parseLog(log);
        if (parsedLog.name === eventName) {
          events.push(parsedLog);
        }
      } catch (e) {
        // Skip logs that can't be parsed or aren't from our contract
      }
    }
    return events;
  } catch (error) {
    logger('blockchain', 'error', 'Failed to parse events', { error: error.message });
    return [];
  }
};

const getAllBaseIds = async () => {
  try {
    // The updated contract returns both baseIds and bvcIds
    const [baseIds, bvcIds] = await contractConfig.contract.getAllBaseVulnerabilityIds();
    return { baseIds, bvcIds };
  } catch (error) {
    return handleContractError(error, 'getAllBaseIds');
  }
};

/**
 * Get all BVC IDs
 * @returns {Promise<Array>} Array of string BVC IDs
 */
const getAllBvcIds = async () => {
  try {
    const [, bvcIds] = await contractConfig.contract.getAllBaseVulnerabilityIds();
    return bvcIds;
  } catch (error) {
    return handleContractError(error, 'getAllBvcIds');
  }
};

/**
 * Get all vulnerabilities for a specific platform
 * @param {string} platform - Platform code (e.g., "ETH", "SOL")
 * @returns {Promise<Array>} Array of string BVC IDs for the specified platform
 */
const getAllVulnerabilitiesByPlatform = async (platform) => {
  try {
    return await contractConfig.contract.getAllVulnerabilitiesByPlatform(platform);
  } catch (error) {
    return handleContractError(error, 'getAllVulnerabilitiesByPlatform');
  }
};

const getVulnerabilityVersions = async (baseIdBytes32) => {
  try {
    // The updated contract returns string BVC IDs for each version
    return await contractConfig.contract.getVulnerabilityVersions(baseIdBytes32);
  } catch (error) {
    return handleContractError(error, 'getVulnerabilityVersions');
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

/**
 * Get paginated BVC IDs
 * @param {number} page - Page number (1-based)
 * @param {number} pageSize - Number of items per page
 * @returns {Promise<Array>} Array of string BVC IDs
 */
const getPaginatedVulnerabilityIds = async (page, pageSize) => {
  try {
    // The updated contract returns BVC IDs directly
    return await contractConfig.contract.getPaginatedVulnerabilityIds(page, pageSize);
  } catch (error) {
    return handleContractError(error, 'getPaginatedVulnerabilityIds');
  }
};

/**
 * Get total number of vulnerabilities
 * @returns {Promise<number>} Total count of vulnerabilities
 */
const getTotalVulnerabilitiesCount = async () => {
  try {
    const [baseIds] = await contractConfig.contract.getAllBaseVulnerabilityIds();
    return baseIds.length;
  } catch (error) {
    return handleContractError(error, 'getTotalVulnerabilitiesCount');
  }
};

/**
 * Gets paginated vulnerabilities with full data
 * @param {number} page - Page number (1-based)
 * @param {number} pageSize - Number of items per page
 * @returns {Promise<Object>} Object with pagination info and full vulnerability data
 */
const getPaginatedAllVulnerabilities = async (page, pageSize) => {
  try {
    // Get paginated BVC IDs
    const bvcIds = await getPaginatedVulnerabilityIds(page, pageSize);
    
    // Get total count for pagination metadata
    const totalCount = await getTotalVulnerabilitiesCount();
    const totalPages = Math.ceil(totalCount / pageSize);
    
    // For each ID in this page, get the full vulnerability data
    const vulnerabilitiesData = [];
    
    for (const bvcId of bvcIds) {
      try {
        // Get the full vulnerability data for this BVC ID
        const vulnerabilityData = await getVulnerability(bvcId);
        
        // Extract the baseId from the response
        const baseId = vulnerabilityData[2]; // Position in return tuple
        
        // Push to results array
        vulnerabilitiesData.push({
          bvcId,
          baseId,
          data: vulnerabilityData
        });
      } catch (error) {
        logger('blockchain', 'error', 'Error fetching vulnerability data', {
          bvcId,
          error: error.message
        });
        // If we can't get full data, push a minimal object
        vulnerabilitiesData.push({
          bvcId,
          data: null,
          error: error.message
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
      vulnerabilities: vulnerabilitiesData
    };
  } catch (error) {
    return handleContractError(error, 'getPaginatedAllVulnerabilities');
  }
};

/**
 * Extract the year from a discovery date string (JavaScript implementation)
 * @param {string} discoveryDate - Date string in format YYYY-MM-DD or YYYY
 * @returns {Promise<number>} The extracted year or 0 if invalid/empty
 */
const extractYearFromDate = async (discoveryDate) => {
  try {
    // JavaScript implementation to replace contract call
    if (!discoveryDate) {
      return 0;
    }
    
    // For YYYY format
    if (discoveryDate.length === 4 && /^\d{4}$/.test(discoveryDate)) {
      return parseInt(discoveryDate);
    }
    
    // For YYYY-MM-DD format
    if (discoveryDate.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(discoveryDate)) {
      return parseInt(discoveryDate.substring(0, 4));
    }
    
    // Invalid format
    return 0;
  } catch (error) {
    logger('blockchain', 'error', 'Year extraction error', { error: error.message });
    return 0;
  }
};

/**
 * Gets a vulnerability's counter for a specific platform and year
 * @param {string} platform - Platform code (e.g., "ETH", "SOL")
 * @param {number} year - Year (e.g., 2023)
 * @returns {Promise<number>} Current counter value
 */
const getCurrentCounter = async (platform, year) => {
  try {
    return await contractConfig.contract.getCurrentCounter(platform, year);
  } catch (error) {
    return handleContractError(error, 'getCurrentCounter');
  }
};

/**
 * Sets a vulnerability's counter for a specific platform and year (admin only)
 * @param {string} platform - Platform code (e.g., "ETH", "SOL")
 * @param {number} year - Year (e.g., 2023)
 * @param {number} value - New counter value
 * @returns {Promise<Object>} Transaction object
 */
const setCounter = async (platform, year, value) => {
  try {
    const tx = await contractConfig.contract.setCounter(platform, year, value);
    logger('blockchain', 'info', 'Counter update submitted', {
      platform,
      year,
      value,
      txHash: tx.hash
    });
    return tx;
  } catch (error) {
    return handleContractError(error, 'setCounter');
  }
};

/**
 * Transfers ownership of the contract (admin only)
 * @param {string} newOwner - Address of the new owner
 * @returns {Promise<Object>} Transaction object
 */
const transferOwnership = async (newOwner) => {
  try {
    const tx = await contractConfig.contract.transferOwnership(newOwner);
    logger('blockchain', 'info', 'Ownership transfer submitted', {
      newOwner,
      txHash: tx.hash
    });
    return tx;
  } catch (error) {
    return handleContractError(error, 'transferOwnership');
  }
};

/**
 * Verify technical details against a hash
 * @param {string} bvcId - The BVC ID string
 * @param {Object} technicalDetails - The technical details to verify
 * @returns {Promise<boolean>} True if the technical details match the stored hash
 */
const verifyTechnicalDetails = async (bvcId, technicalDetails) => {
  try {
    return await contractConfig.contract.verifyTechnicalDetails(bvcId, technicalDetails);
  } catch (error) {
    return handleContractError(error, 'verifyTechnicalDetails');
  }
};

/**
 * Verify proof of exploit against a hash
 * @param {string} bvcId - The BVC ID string
 * @param {Object} proofOfExploit - The proof of exploit to verify
 * @returns {Promise<boolean>} True if the proof of exploit matches the stored hash
 */
const verifyProofOfExploit = async (bvcId, proofOfExploit) => {
  try {
    return await contractConfig.contract.verifyProofOfExploit(bvcId, proofOfExploit);
  } catch (error) {
    return handleContractError(error, 'verifyProofOfExploit');
  }
};

module.exports = {
  addVulnerability,
  getVulnerability,
  getAllBaseIds,
  getAllBvcIds,
  getVulnerabilityVersions,
  setVulnerabilityStatus,
  getPaginatedVulnerabilityIds,
  getTotalVulnerabilitiesCount,
  getPaginatedAllVulnerabilities,
  getCurrentCounter,
  setCounter,
  transferOwnership,
  getEventsFromReceipt,
  extractYearFromDate,
  validateDiscoveryDate,
  preGenerateBvcId,
  verifyTechnicalDetails,
  verifyProofOfExploit,
  getAllVulnerabilitiesByPlatform,
  contractInstance: contractConfig.contract,
  provider: contractConfig.provider
};