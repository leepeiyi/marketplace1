// tests/integration/health.test.js
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { TestServer } from './setup.js';

describe('Health Check Integration Tests', () => {
  let testServer;
  let baseURL;

  beforeAll(async () => {
    testServer = new TestServer();
    await testServer.setup();
    baseURL = testServer.baseURL;
  });

  afterAll(async () => {
    await testServer.teardown();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(baseURL)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        websocket: expect.any(Boolean),
        connections: expect.any(Object)
      });
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('404 handler', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(baseURL)
        .get('/non-existent-route')
        .expect(404);

      expect(response.body).toMatchObject({
        error: 'Route not found',
        path: '/non-existent-route'
      });
    });
  });
});