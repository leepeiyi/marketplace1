// tests/integration/escrow.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { TestServer } from './setup.js';

describe('Escrow Routes Integration Tests', () => {
  let testServer;
  let baseURL;
  let testData;
  let testJob;
  let testEscrow;

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
    testData = await testServer.seedTestData();
    
    // Create a booked job
    testJob = await testServer.prisma.job.create({
      data: {
        id: 'job-1',
        categoryId: testData.categories[0].id,
        customerId: testData.users.customer.id,
        providerId: testData.users.providerUser.id,
        title: 'Test job with escrow',
        description: 'Test description',
        type: 'QUICK_BOOK',
        status: 'BOOKED',
        latitude: 40.7128,
        longitude: -74.0060,
        address: '123 Test St'
      }
    });

    // Create escrow
    testEscrow = await testServer.prisma.escrow.create({
      data: {
        id: 'escrow-1',
        jobId: testJob.id,
        amount: 200,
        status: 'HELD'
      }
    });
  });

  describe('GET /api/escrow/job/:jobId', () => {
    it('should return escrow details for job', async () => {
      const response = await request(baseURL)
        .get(`/api/escrow/job/${testJob.id}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: testEscrow.id,
        jobId: testJob.id,
        amount: 200,
        status: 'HELD'
      });
      expect(response.body.job).toBeDefined();
      expect(response.body.job.customer).toBeDefined();
    });

    it('should return 404 for job without escrow', async () => {
      const otherJob = await testServer.prisma.job.create({
        data: {
          id: 'job-2',
          categoryId: testData.categories[0].id,
          customerId: testData.users.customer.id,
          title: 'Job without escrow',
          description: 'Test',
          type: 'POST_QUOTE',
          status: 'BROADCASTED',
          latitude: 40.7128,
          longitude: -74.0060,
          address: '123 Test St'
        }
      });

      await request(baseURL)
        .get(`/api/escrow/job/${otherJob.id}`)
        .expect(404);
    });
  });

  describe('POST /api/escrow/:escrowId/release', () => {
    it('should release escrow by customer', async () => {
      const response = await request(baseURL)
        .post(`/api/escrow/${testEscrow.id}/release`)
        .set('x-user-id', testData.users.customer.id)
        .expect(200);

      expect(response.body).toMatchObject({
        id: testEscrow.id,
        status: 'RELEASED'
      });
      expect(response.body.releasedAt).toBeDefined();
    });

    it('should return 401 without user ID', async () => {
      await request(baseURL)
        .post(`/api/escrow/${testEscrow.id}/release`)
        .expect(401);
    });

    it('should return 403 if not customer', async () => {
      await request(baseURL)
        .post(`/api/escrow/${testEscrow.id}/release`)
        .set('x-user-id', testData.users.providerUser.id)
        .expect(403);
    });

    it('should return 404 for non-existent escrow', async () => {
      await request(baseURL)
        .post('/api/escrow/non-existent/release')
        .set('x-user-id', testData.users.customer.id)
        .expect(404);
    });

    it('should return 400 if escrow not in held status', async () => {
      // Update escrow to released
      await testServer.prisma.escrow.update({
        where: { id: testEscrow.id },
        data: { status: 'RELEASED' }
      });

      await request(baseURL)
        .post(`/api/escrow/${testEscrow.id}/release`)
        .set('x-user-id', testData.users.customer.id)
        .expect(400);
    });
  });
});