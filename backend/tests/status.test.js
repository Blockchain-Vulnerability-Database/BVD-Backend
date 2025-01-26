const request = require('supertest');
const app = require('../server'); // Import your Express app

describe('GET /status', () => {
  it('should return the blockchain status', async () => {
    const response = await request(app).get('/status');
    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('status', 'success');
    expect(response.body).toHaveProperty('blockNumber');
  });

  it('should handle blockchain provider errors gracefully', async () => {
    jest.spyOn(global.provider, 'getBlockNumber').mockRejectedValueOnce(new Error('Blockchain error'));

    const response = await request(app).get('/status');
    expect(response.statusCode).toBe(500);
    expect(response.body).toHaveProperty('status', 'error');
    expect(response.body).toHaveProperty('message', 'Blockchain error');
  });
});