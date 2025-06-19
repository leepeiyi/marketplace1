import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { TestServer } from './setup.js';

describe('Basic Integration Tests', () => {
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

  beforeEach(async () => {
    await testServer.cleanup();
  });

  describe('Server Health', () => {
    it('should respond to basic requests', async () => {
      const response = await request(baseURL)
        .get('/api/jobs/test')
        .expect(200);

      expect(response.body).toEqual({
        message: 'Jobs route is working!'
      });
    });
  });

  describe('Categories API', () => {
    it('should return empty categories initially', async () => {
      const response = await request(baseURL)
        .get('/api/categories')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should return categories after seeding', async () => {
      await testServer.seedTestData();

      const response = await request(baseURL)
        .get('/api/categories')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toMatchObject({
        name: expect.any(String),
        icon: expect.any(String),
        isActive: true
      });
    });
  });

  describe('Users API', () => {
    it('should create a new user', async () => {
      const userData = {
        email: 'newuser@test.com',
        name: 'New User',
        phone: '+65 9999 8888',
        role: 'CUSTOMER'
      };

      const response = await request(baseURL)
        .post('/api/users')
        .send(userData)
        .expect(201);

      expect(response.body).toMatchObject({
        email: userData.email,
        name: userData.name,
        role: userData.role
      });
      expect(response.body.id).toBeDefined();
    });
  });
});