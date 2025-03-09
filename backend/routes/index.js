const express = require('express');
const router = express.Router();
const vulnerabilities = require('./vulnerabilities');
const health = require('./health');

router.use('/vulnerabilities', vulnerabilities);
router.use('/health', health);

module.exports = router;