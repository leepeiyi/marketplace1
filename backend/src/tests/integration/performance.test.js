// tests/integration/performance.test.js
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "@jest/globals";
import request from "supertest";
import { TestServer } from "./setup.js";

describe("Performance Integration Tests", () => {
  let testServer;
  let baseURL;
  let testData;

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
  });

  describe("Large Dataset Performance", () => {
    it("should handle many available jobs efficiently", async () => {
      // Create many jobs
      const jobsData = Array.from({ length: 100 }, (_, i) => ({
        id: `job-${i}`,
        categoryId: testData.categories[0].id,
        customerId: testData.users.customer.id,
        title: `Job ${i}`,
        description: `Description ${i}`,
        type: "QUICK_BOOK",
        status: "BROADCASTED",
        latitude: 40.7128 + i * 0.001,
        longitude: -74.006 + i * 0.001,
        address: `${i} Test St`,
        arrivalWindow: 2,
      }));

      await testServer.prisma.job.createMany({
        data: jobsData,
      });

      const startTime = Date.now();

      const response = await request(baseURL)
        .get("/api/jobs/available")
        .set("x-user-id", testData.users.providerUser.id)
        .expect(200);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(response.body).toHaveLength(100);
      expect(responseTime).toBeLessThan(2000); // Should respond within 2 seconds
    });

    it("should handle many bids for ranking efficiently", async () => {
      const job = await testServer.prisma.job.create({
        data: {
          id: "job-1",
          categoryId: testData.categories[0].id,
          customerId: testData.users.customer.id,
          title: "Many bids test",
          description: "Test description",
          type: "POST_QUOTE",
          status: "BROADCASTED",
          latitude: 40.7128,
          longitude: -74.006,
          address: "123 Test St",
        },
      });

      // Create many providers and bids
      const providers = [];
      for (let i = 0; i < 50; i++) {
        const user = await testServer.prisma.user.create({
          data: {
            id: `provider-${i}`,
            email: `provider${i}@test.com`,
            name: `Provider ${i}`,
            role: "PROVIDER",
          },
        });

        const provider = await testServer.prisma.provider.create({
          data: {
            userId: user.id,
            averageRating: 3 + Math.random() * 2,
            reliabilityScore: 80 + Math.random() * 20,
            latitude: 1.3521 + i * 0.0001,
            longitude: 103.8198 + i * 0.0001,
            isAvailable: true,
            completedJobs: 5,
            totalRatings: 5,
            tier: "TIER_A",
          },
        });

        providers.push({ user, provider });
      }

      // Create bids
      const bidsData = providers.map((p, i) => ({
        id: `bid-${i}`,
        jobId: job.id,
        providerId: p.user.id,
        price: 100 + Math.random() * 200, // $100-$300
        estimatedEta: 30 + Math.random() * 120, // 30-150 minutes
        status: "PENDING",
      }));

      await testServer.prisma.bid.createMany({
        data: bidsData,
      });

      const startTime = Date.now();

      const response = await request(baseURL)
        .get(`/api/bids/${job.id}/ranked-bids`)
        .set("x-user-id", testData.users.customer.id)
        .expect(200);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(response.body).toHaveLength(50);
      expect(responseTime).toBeLessThan(1000); // Should respond within 1 second

      // Verify bids are properly ranked
      const scores = response.body.map((bid) => bid.rank_score);
      const sortedScores = [...scores].sort((a, b) => b - a);
      expect(scores).toEqual(sortedScores);
    });
  });

  describe("Pagination and Filtering", () => {
    it("should efficiently filter jobs by category", async () => {
      // Create jobs in different categories
      const jobs1 = Array.from({ length: 30 }, (_, i) => ({
        id: `job-cat1-${i}`,
        categoryId: testData.categories[0].id,
        customerId: testData.users.customer.id,
        title: `Plumbing Job ${i}`,
        description: `Description ${i}`,
        type: "QUICK_BOOK",
        status: "BROADCASTED",
        latitude: 40.7128,
        longitude: -74.006,
        address: `${i} Test St`,
        arrivalWindow: 2,
      }));

      const jobs2 = Array.from({ length: 30 }, (_, i) => ({
        id: `job-cat2-${i}`,
        categoryId: testData.categories[1].id,
        customerId: testData.users.customer.id,
        title: `Electrical Job ${i}`,
        description: `Description ${i}`,
        type: "QUICK_BOOK",
        status: "BROADCASTED",
        latitude: 40.7128,
        longitude: -74.006,
        address: `${i} Test St`,
        arrivalWindow: 2,
      }));

      await testServer.prisma.job.createMany({
        data: [...jobs1, ...jobs2],
      });

      const startTime = Date.now();

      // Provider only serves plumbing, should only see those jobs
      const response = await request(baseURL)
        .get("/api/jobs/available")
        .set("x-user-id", testData.users.providerUser.id)
        .expect(200);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(response.body).toHaveLength(30); // Only plumbing jobs
      expect(responseTime).toBeLessThan(1000);

      // Verify all returned jobs are plumbing
      response.body.forEach((job) => {
        expect(job.category.name).toBe("Plumbing");
      });
    });
  });
});
