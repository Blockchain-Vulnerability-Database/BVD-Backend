const fs = require('fs');

const filePath = '/Users/dcurtis/Git/BVD/BVD-Smart-Contract/entries/BVC-TEST-004.json';

if (fs.existsSync(filePath)) {
  console.log('File exists and is accessible.');
} else {
  console.log('File does not exist or is inaccessible.');
}
