// tests/integration/bids.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { TestServer } from './setup.js';

describe('Bid Routes Integration Tests', () => {
  let testServer;
  let baseURL;
  let testData;
  let testJob;

  beforeAll(async () => {
    testServer = new TestServer();
    await testServer.setup();
    baseURL = testServer.getBaseURL();
  }, 30000);

  afterAll(async () => {
    await testServer.teardown();
  }, 15000);

  beforeEach(async () => {
    await testServer.cleanup();
    testData = await testServer.seedTestData();
    
    // Create a test job for bidding - FIXED to match your schema
    testJob = await testServer.prisma.job.create({
      data: {
        id: 'job-1',
        categoryId: testData.category1.id,
        customerId: testData.homeowner.id, // Fixed: use homeowner instead of customer
        title: 'Test job for bidding',
        description: 'Test description',
        type: 'POST_QUOTE', // Fixed: use enum value
        status: 'BROADCASTED',
        latitude: 40.7128,
        longitude: -74.0060,
        address: '123 Test St'
      }
    });
  }, 15000);

  describe('POST /api/bids', () => {
    it('should create a new bid', async () => {
      const bidData = {
        jobId: testJob.id,
        price: 200,
        note: 'I can do this job quickly',
        estimatedEta: 60
      };

      const response = await request(baseURL)
        .post('/api/bids')
        .set('x-user-id', testData.providerUser.id) // Fixed: use providerUser
        .send(bidData)
        .expect(201);

      expect(response.body).toMatchObject({
        jobId: testJob.id,
        price: 200,
        note: 'I can do this job quickly',
        estimatedEta: 60,
        status: 'PENDING'
      });
    });

    it('should auto-hire if bid meets accept price', async () => {
      // Update job to have accept price
      await testServer.prisma.job.update({
        where: { id: testJob.id },
        data: { acceptPrice: 250 }
      });

      const bidData = {
        jobId: testJob.id,
        price: 200, // Below accept price
        estimatedEta: 60
      };

      const response = await request(baseURL)
        .post('/api/bids')
        .set('x-user-id', testData.providerUser.id)
        .send(bidData)
        .expect(201);

      expect(response.body.autoHired).toBe(true);
    });

    it('should return 409 if provider already bid', async () => {
      const bidData = {
        jobId: testJob.id,
        price: 200,
        estimatedEta: 60
      };

      // Create first bid
      await request(baseURL)
        .post('/api/bids')
        .set('x-user-id', testData.providerUser.id)
        .send(bidData)
        .expect(201);

      // Try to bid again
      await request(baseURL)
        .post('/api/bids')
        .set('x-user-id', testData.providerUser.id)
        .send(bidData)
        .expect(409);
    });

    it('should return 400 for invalid bid data', async () => {
      const invalidData = {
        jobId: testJob.id,
        price: -100, // Negative price
        estimatedEta: 10 // Too short
      };

      await request(baseURL)
        .post('/api/bids')
        .set('x-user-id', testData.providerUser.id)
        .send(invalidData)
        .expect(400);
    });
  });

  describe('GET /api/bids/job/:jobId', () => {
    it('should return all bids for a job', async () => {
      const bid = await testServer.prisma.bid.create({
        data: {
          jobId: testJob.id,
          providerId: testData.providerUser.id,
          price: 200,
          estimatedEta: 60,
          status: 'PENDING'
        }
      });

      const response = await request(baseURL)
        .get(`/api/bids/job/${testJob.id}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        price: 200,
        status: 'PENDING'
      });
    });

    it('should return ranked bids when requested', async () => {
      // Create multiple bids - Need a second provider user
      const secondProviderUser = await testServer.prisma.user.create({
        data: {
          id: 'user-provider-2',
          email: 'provider2@test.com',
          name: 'Test Provider 2',
          phone: '+1234567892',
          role: 'PROVIDER', // Fixed: use role instead of userType
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      // Create provider profile for second user
      await testServer.prisma.provider.create({
        data: {
          id: 'provider-2',
          userId: secondProviderUser.id,
          latitude: 40.7128,
          longitude: -74.0060,
          completedJobs: 5,
          averageRating: 4.0,
          totalRatings: 5,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      await testServer.prisma.bid.createMany({
        data: [
          {
            jobId: testJob.id,
            providerId: testData.providerUser.id,
            price: 300,
            estimatedEta: 60,
            status: 'PENDING'
          },
          {
            jobId: testJob.id,
            providerId: secondProviderUser.id,
            price: 250,
            estimatedEta: 90,
            status: 'PENDING'
          }
        ]
      });

      const response = await request(baseURL)
        .get(`/api/bids/job/${testJob.id}?ranked=true`)
        .expect(200);

      expect(response.body).toHaveLength(2);
    });
  });

  describe('GET /api/bids/:jobId/ranked-bids', () => {
    it('should return ranked bids with scores', async () => {
      const bid = await testServer.prisma.bid.create({
        data: {
          jobId: testJob.id,
          providerId: testData.providerUser.id,
          price: 200,
          estimatedEta: 60,
          status: 'PENDING'
        }
      });

      const response = await request(baseURL)
        .get(`/api/bids/${testJob.id}/ranked-bids`)
        .set('x-user-id', testData.homeowner.id) // Fixed: use homeowner
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toHaveProperty('rank_score');
      expect(typeof response.body[0].rank_score).toBe('number');
    });

    it('should require authentication', async () => {
      await request(baseURL)
        .get(`/api/bids/${testJob.id}/ranked-bids`)
        .expect(401);
    });
  });

  describe('POST /api/bids/:bidId/accept', () => {
    it('should accept a bid', async () => {
      const bid = await testServer.prisma.bid.create({
        data: {
          id: 'bid-1',
          jobId: testJob.id,
          providerId: testData.providerUser.id,
          price: 200,
          estimatedEta: 60,
          status: 'PENDING'
        }
      });

      const response = await request(baseURL)
        .post(`/api/bids/${bid.id}/accept`)
        .set('x-user-id', testData.homeowner.id) // Fixed: use homeowner
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.job.status).toBe('BOOKED');
      expect(response.body.bid.status).toBe('ACCEPTED');
      expect(response.body.escrow).toBeDefined();
    });

    it('should return 403 if not job owner', async () => {
      const bid = await testServer.prisma.bid.create({
        data: {
          id: 'bid-1',
          jobId: testJob.id,
          providerId: testData.providerUser.id,
          price: 200,
          estimatedEta: 60,
          status: 'PENDING'
        }
      });

      await request(baseURL)
        .post(`/api/bids/${bid.id}/accept`)
        .set('x-user-id', 'other-user')
        .expect(403);
    });

    it('should return 404 for non-existent bid', async () => {
      await request(baseURL)
        .post('/api/bids/non-existent/accept')
        .set('x-user-id', testData.homeowner.id) // Fixed: use homeowner
        .expect(404);
    });
  });

  describe('GET /api/bids/:bidId', () => {
    it('should return bid details for authorized user', async () => {
      const bid = await testServer.prisma.bid.create({
        data: {
          id: 'bid-1',
          jobId: testJob.id,
          providerId: testData.providerUser.id,
          price: 200,
          estimatedEta: 60,
          status: 'PENDING'
        }
      });

      const response = await request(baseURL)
        .get(`/api/bids/${bid.id}`)
        .set('x-user-id', testData.providerUser.id)
        .expect(200);

      expect(response.body).toMatchObject({
        id: bid.id,
        price: 200,
        status: 'PENDING'
      });
    });

    it('should return 403 for unauthorized user', async () => {
      const bid = await testServer.prisma.bid.create({
        data: {
          id: 'bid-1',
          jobId: testJob.id,
          providerId: testData.providerUser.id,
          price: 200,
          estimatedEta: 60,
          status: 'PENDING'
        }
      });

      await request(baseURL)
        .get(`/api/bids/${bid.id}`)
        .set('x-user-id', 'unauthorized-user')
        .expect(403);
    });
  });

  describe('PUT /api/bids/:bidId', () => {
    it('should update bid details', async () => {
      const bid = await testServer.prisma.bid.create({
        data: {
          id: 'bid-1',
          jobId: testJob.id,
          providerId: testData.providerUser.id,
          price: 200,
          estimatedEta: 60,
          status: 'PENDING'
        }
      });

      const updateData = {
        price: 250,
        note: 'Updated bid with better materials',
        estimatedEta: 90
      };

      const response = await request(baseURL)
        .put(`/api/bids/${bid.id}`)
        .set('x-user-id', testData.providerUser.id)
        .send(updateData)
        .expect(200);

      expect(response.body).toMatchObject({
        price: 250,
        note: 'Updated bid with better materials',
        estimatedEta: 90
      });
    });

    it('should return 403 if not bid owner', async () => {
      const bid = await testServer.prisma.bid.create({
        data: {
          id: 'bid-1',
          jobId: testJob.id,
          providerId: testData.providerUser.id,
          price: 200,
          estimatedEta: 60,
          status: 'PENDING'
        }
      });

      await request(baseURL)
        .put(`/api/bids/${bid.id}`)
        .set('x-user-id', 'other-user')
        .send({ price: 300 })
        .expect(403);
    });

    it('should return 400 if bid cannot be updated', async () => {
      const bid = await testServer.prisma.bid.create({
        data: {
          id: 'bid-1',
          jobId: testJob.id,
          providerId: testData.providerUser.id,
          price: 200,
          estimatedEta: 60,
          status: 'ACCEPTED' // Cannot update accepted bid
        }
      });

      await request(baseURL)
        .put(`/api/bids/${bid.id}`)
        .set('x-user-id', testData.providerUser.id)
        .send({ price: 300 })
        .expect(400);
    });
  });

  describe('DELETE /api/bids/:bidId', () => {
    it('should withdraw a bid', async () => {
      const bid = await testServer.prisma.bid.create({
        data: {
          id: 'bid-1',
          jobId: testJob.id,
          providerId: testData.providerUser.id,
          price: 200,
          estimatedEta: 60,
          status: 'PENDING'
        }
      });

      const response = await request(baseURL)
        .delete(`/api/bids/${bid.id}`)
        .set('x-user-id', testData.providerUser.id)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Bid withdrawn successfully');
    });

    it('should return 403 if not bid owner', async () => {
      const bid = await testServer.prisma.bid.create({
        data: {
          id: 'bid-1',
          jobId: testJob.id,
          providerId: testData.providerUser.id,
          price: 200,
          estimatedEta: 60,
          status: 'PENDING'
        }
      });

      await request(baseURL)
        .delete(`/api/bids/${bid.id}`)
        .set('x-user-id', 'other-user')
        .expect(403);
    });
  });
});