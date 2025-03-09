const morgan = require('morgan');
const { logger } = require('../services/logger');

module.exports = {
  requestLogger: morgan('[:date[iso]] :method :url :status :response-time ms - :res[content-length]'),

  errorHandler: (err, req, res, next) => {
    logger('middleware', 'error', err.message, err.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
};