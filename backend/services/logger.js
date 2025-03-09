const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

module.exports = {
  logger: (route, type, message, data = null) => {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, route, type, message, data };
    const logFile = path.join(logDir, `${timestamp.split('T')[0]}.log`);
    
    console.log(`[${timestamp}] [${route}] [${type}] ${message}`);
    if (data) console[type === 'error' ? 'error' : 'log'](data);
    
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  }
};