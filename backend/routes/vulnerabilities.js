const express = require('express');
const router = express.Router();

// Import modular routers
const createRouter = require('./vulnerabilities/create');
const queryRouter = require('./vulnerabilities/query');
const versionsRouter = require('./vulnerabilities/versions');
const statusRouter = require('./vulnerabilities/status');
const validateRouter = require('./vulnerabilities/validate');

// Re-export all the controller functions for backward compatibility
// Creation routes
router.preGenerateBvcId = createRouter.preGenerateBvcId;
router.addVulnerability = createRouter.addVulnerability;

// Query routes
router.getVulnerability = queryRouter.getVulnerability;
router.getAllVulnerabilities = queryRouter.getAllVulnerabilities;
router.getPaginatedAllVulnerabilities = queryRouter.getPaginatedAllVulnerabilities;
router.getPaginatedVulnerabilityIds = queryRouter.getPaginatedVulnerabilityIds;
router.getAllVulnerabilitiesByPlatform = queryRouter.getAllVulnerabilitiesByPlatform;
router.getAllVulnerabilityIds = queryRouter.getAllVulnerabilityIds;

// Version routes
router.getVulnerabilityVersions = versionsRouter.getVulnerabilityVersions;

// Status routes
router.setVulnerabilityStatus = statusRouter.setVulnerabilityStatus;

// Validation routes
router.validateDiscoveryDate = validateRouter.validateDiscoveryDate;
router.verifyTechnicalDetails = validateRouter.verifyTechnicalDetails;
router.verifyProofOfExploit = validateRouter.verifyProofOfExploit;

// Use the modular routers
router.use('/create', createRouter);
router.use('/query', queryRouter);
router.use('/versions', versionsRouter);
router.use('/status', statusRouter);
router.use('/validate', validateRouter);

// Keep the original routes for backward compatibility
// Creation routes
router.get('/preGenerateBvcId', createRouter.preGenerateBvcId);
router.post('/addVulnerability', createRouter.addVulnerability);

// Query routes
router.get('/getVulnerability/:id', queryRouter.getVulnerability);
router.get('/getAllVulnerabilities', queryRouter.getAllVulnerabilities);
router.get('/getPaginatedAllVulnerabilities', queryRouter.getPaginatedAllVulnerabilities);
router.get('/getPaginatedVulnerabilityIds', queryRouter.getPaginatedVulnerabilityIds);
router.get('/getAllVulnerabilitiesByPlatform', queryRouter.getAllVulnerabilitiesByPlatform);
router.get('/getAllVulnerabilityIds', queryRouter.getAllVulnerabilityIds);

// Version routes
router.get('/getVulnerabilityVersions/:id', versionsRouter.getVulnerabilityVersions);

// Status routes
router.post('/setVulnerabilityStatus', statusRouter.setVulnerabilityStatus);

// Validation routes
router.get('/validateDiscoveryDate', validateRouter.validateDiscoveryDate);
router.post('/verifyTechnicalDetails', validateRouter.verifyTechnicalDetails);
router.post('/verifyProofOfExploit', validateRouter.verifyProofOfExploit);

module.exports = router;