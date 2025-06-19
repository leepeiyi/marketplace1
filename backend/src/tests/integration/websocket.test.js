// tests/integration/websocket.test.js
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { TestServer } from './setup';

describe('WebSocket Integration Tests', () => {
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

  describe('GET /api/ws/stats', () => {
    it('should return WebSocket stats', async () => {
      const response = await request(baseURL)
        .get('/api/ws/stats')
        .expect(200);

      expect(response.body).toMatchObject({
        totalConnections: expect.any(Number),
        activeConnections: expect.any(Number)
      });
    });
  });
});