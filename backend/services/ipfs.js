const axios = require('axios');
const FormData = require('form-data');

module.exports = {
  uploadToIPFS: async (fileBuffer, filename) => {
    const formData = new FormData();
    formData.append('file', fileBuffer, { 
      filename,
      contentType: 'application/json' 
    });

    const response = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      formData,
      {
        headers: {
          Authorization: `Bearer ${process.env.PINATA_JWT}`,
          ...formData.getHeaders()
        }
      }
    );
    return response.data.IpfsHash;
  }
};