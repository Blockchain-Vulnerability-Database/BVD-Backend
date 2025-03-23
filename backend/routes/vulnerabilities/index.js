const express = require('express');
const router = express.Router();

// Import modular route handlers
const createRoutes = require('./create');
const queryRoutes = require('./query');
const versionsRoutes = require('./versions');
const statusRoutes = require('./status');
const validateRoutes = require('./validate');

// Register modular routes
router.use('/create', createRoutes);
router.use('/query', queryRoutes);
router.use('/versions', versionsRoutes);
router.use('/status', statusRoutes);
router.use('/validate', validateRoutes);

// Keep backward compatibility for existing API consumers
// Map legacy routes to new modular endpoints

// Creation routes
router.get('/preGenerateBvcId', (req, res) => createRoutes.preGenerateBvcId(req, res));
router.post('/addVulnerability', (req, res) => createRoutes.addVulnerability(req, res));

// Query routes
router.get('/getVulnerability/:id', (req, res) => queryRoutes.getVulnerability(req, res));
router.get('/getAllVulnerabilities', (req, res) => queryRoutes.getAllVulnerabilities(req, res));
router.get('/getPaginatedAllVulnerabilities', (req, res) => queryRoutes.getPaginatedAllVulnerabilities(req, res));
router.get('/getPaginatedVulnerabilityIds', (req, res) => queryRoutes.getPaginatedVulnerabilityIds(req, res));
router.get('/getAllVulnerabilitiesByPlatform', (req, res) => queryRoutes.getAllVulnerabilitiesByPlatform(req, res));
router.get('/getAllVulnerabilityIds', (req, res) => queryRoutes.getAllVulnerabilityIds(req, res));

// Version routes
router.get('/getVulnerabilityVersions/:id', (req, res) => versionsRoutes.getVulnerabilityVersions(req, res));

// Status routes
router.post('/setVulnerabilityStatus', (req, res) => statusRoutes.setVulnerabilityStatus(req, res));

// Validation routes
router.get('/validateDiscoveryDate', (req, res) => validateRoutes.validateDiscoveryDate(req, res));
router.post('/verifyTechnicalDetails', (req, res) => validateRoutes.verifyTechnicalDetails(req, res));
router.post('/verifyProofOfExploit', (req, res) => validateRoutes.verifyProofOfExploit(req, res));

module.exports = router;