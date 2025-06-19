// tests/integration/jobs.test.js
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

describe("Job Routes Integration Tests", () => {
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

  describe("GET /api/jobs/test", () => {
    it("should return test message", async () => {
      const response = await request(baseURL).get("/api/jobs/test").expect(200);

      expect(response.body).toEqual({
        message: "Jobs route is working!",
      });
    });
  });

  describe("POST /api/jobs/quick-book", () => {
    it("should create a quick book job", async () => {
      const jobData = {
        categoryId: testData.categories[0].id,
        title: "Fix leaky faucet",
        description: "Kitchen faucet is dripping constantly",
        latitude: 40.7128,
        longitude: -74.006,
        address: "123 Main St, New York, NY",
        arrivalWindow: 2,
      };

      const response = await request(baseURL)
        .post("/api/jobs/quick-book")
        .set("x-user-id", testData.users.customer.id)
        .send(jobData)
        .expect(201);

      expect(response.body).toMatchObject({
        title: jobData.title,
        type: "QUICK_BOOK",
        status: expect.stringMatching(/BROADCASTED|PENDING/),
      });
    });

    it("should return 401 without user ID", async () => {
      const jobData = {
        categoryId: testData.categories[0].id,
        title: "Fix leaky faucet",
        description: "Kitchen faucet is dripping",
        latitude: 40.7128,
        longitude: -74.006,
        address: "123 Main St",
        arrivalWindow: 2,
      };

      await request(baseURL)
        .post("/api/jobs/quick-book")
        .send(jobData)
        .expect(401);
    });

    it("should return 400 for invalid job data", async () => {
      const invalidData = {
        categoryId: "",
        title: "",
        arrivalWindow: 25, // Too high
      };

      await request(baseURL)
        .post("/api/jobs/quick-book")
        .set("x-user-id", testData.users.customer.id)
        .send(invalidData)
        .expect(400);
    });
  });

  describe("POST /api/jobs/post-quote", () => {
    it("should create a post quote job", async () => {
      const jobData = {
        categoryId: testData.categories[0].id,
        title: "Install new toilet",
        description: "Replace old toilet with new one",
        latitude: 40.7128,
        longitude: -74.006,
        address: "456 Oak Ave, New York, NY",
        acceptPrice: 300,
      };

      const response = await request(baseURL)
        .post("/api/jobs/post-quote")
        .set("x-user-id", testData.users.customer.id)
        .send(jobData)
        .expect(201);

      expect(response.body).toMatchObject({
        title: jobData.title,
        type: "POST_QUOTE",
        status: "BROADCASTED",
        acceptPrice: 300,
      });
    });
  });

  describe("GET /api/jobs/available", () => {
    it("should return available jobs for provider", async () => {
      // Create a job first
      await testServer.prisma.job.create({
        data: {
          id: "job-1",
          categoryId: testData.categories[0].id,
          customerId: testData.users.customer.id,
          title: "Fix sink",
          description: "Sink is clogged",
          type: "QUICK_BOOK",
          status: "BROADCASTED",
          latitude: 40.7128,
          longitude: -74.006,
          address: "123 Test St",
          arrivalWindow: 2,
        },
      });

      const response = await request(baseURL)
        .get("/api/jobs/available")
        .set("x-user-id", testData.users.providerUser.id)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        title: "Fix sink",
        type: "QUICK_BOOK",
        status: "BROADCASTED",
      });
    });

    it("should return empty array when no jobs match provider categories", async () => {
      // Create job in category provider doesn't serve
      await testServer.prisma.job.create({
        data: {
          id: "job-1",
          categoryId: testData.categories[1].id, // Electrical, provider only does plumbing
          customerId: testData.users.customer.id,
          title: "Fix wiring",
          description: "Electrical issue",
          type: "QUICK_BOOK",
          status: "BROADCASTED",
          latitude: 40.7128,
          longitude: -74.006,
          address: "123 Test St",
          arrivalWindow: 2,
        },
      });

      const response = await request(baseURL)
        .get("/api/jobs/available")
        .set("x-user-id", testData.users.providerUser.id)
        .expect(200);

      expect(response.body).toHaveLength(0);
    });
  });

  describe("POST /api/jobs/accept", () => {
    it("should accept a quick book job", async () => {
      const job = await testServer.prisma.job.create({
        data: {
          id: "job-1",
          categoryId: testData.categories[0].id,
          customerId: testData.users.customer.id,
          title: "Fix sink",
          description: "Sink is clogged",
          type: "QUICK_BOOK",
          status: "BROADCASTED",
          latitude: 40.7128,
          longitude: -74.006,
          address: "123 Test St",
          arrivalWindow: 2,
        },
      });

      const response = await request(baseURL)
        .post("/api/jobs/accept")
        .set("x-user-id", testData.users.providerUser.id)
        .send({ jobId: job.id })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it("should return 409 if job already taken", async () => {
      const job = await testServer.prisma.job.create({
        data: {
          id: "job-1",
          categoryId: testData.categories[0].id,
          customerId: testData.users.customer.id,
          title: "Fix sink",
          description: "Sink is clogged",
          type: "QUICK_BOOK",
          status: "BOOKED",
          latitude: 40.7128,
          longitude: -74.006,
          address: "123 Test St",
          arrivalWindow: 2,
          providerId: testData.users.providerUser.id,
        },
      });

      await request(baseURL)
        .post("/api/jobs/accept")
        .set("x-user-id", testData.users.providerUser.id)
        .send({ jobId: job.id })
        .expect(409);
    });
  });

  describe("GET /api/jobs/customer", () => {
    it("should return customer jobs", async () => {
      await testServer.prisma.job.create({
        data: {
          id: "job-1",
          categoryId: testData.categories[0].id,
          customerId: testData.users.customer.id,
          title: "Customer job",
          description: "Test job",
          type: "QUICK_BOOK",
          status: "BROADCASTED",
          latitude: 40.7128,
          longitude: -74.006,
          address: "123 Test St",
          arrivalWindow: 2,
        },
      });

      const response = await request(baseURL)
        .get("/api/jobs/customer")
        .set("x-user-id", testData.users.customer.id)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].title).toBe("Customer job");
    });
  });

  describe("GET /api/jobs/provider", () => {
    it("should return provider jobs", async () => {
      await testServer.prisma.job.create({
        data: {
          id: "job-1",
          categoryId: testData.categories[0].id,
          customerId: testData.users.customer.id,
          providerId: testData.users.providerUser.id,
          title: "Provider job",
          description: "Test job",
          type: "QUICK_BOOK",
          status: "BOOKED",
          latitude: 40.7128,
          longitude: -74.006,
          address: "123 Test St",
          arrivalWindow: 2,
        },
      });

      const response = await request(baseURL)
        .get("/api/jobs/provider")
        .set("x-user-id", testData.users.providerUser.id)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        title: "Provider job",
        category: expect.objectContaining({
          name: "Plumbing",
        }),
      });
    });
  });

  describe("GET /api/jobs/:jobId", () => {
    it("should return job details", async () => {
      const job = await testServer.prisma.job.create({
        data: {
          id: "job-1",
          categoryId: testData.categories[0].id,
          customerId: testData.users.customer.id,
          title: "Test job",
          description: "Test description",
          type: "QUICK_BOOK",
          status: "BROADCASTED",
          latitude: 40.7128,
          longitude: -74.006,
          address: "123 Test St",
          arrivalWindow: 2,
        },
      });

      const response = await request(baseURL)
        .get(`/api/jobs/${job.id}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: job.id,
        title: "Test job",
      });
    });

    it("should return 404 for non-existent job", async () => {
      await request(baseURL).get("/api/jobs/non-existent").expect(404);
    });
  });

  describe("POST /api/jobs/:jobId/cancel", () => {
    it("should cancel a job", async () => {
      const job = await testServer.prisma.job.create({
        data: {
          id: "job-1",
          categoryId: testData.categories[0].id,
          customerId: testData.users.customer.id,
          title: "Test job",
          description: "Test description",
          type: "QUICK_BOOK",
          status: "BROADCASTED",
          latitude: 40.7128,
          longitude: -74.006,
          address: "123 Test St",
          arrivalWindow: 2,
        },
      });

      const response = await request(baseURL)
        .post(`/api/jobs/${job.id}/cancel`)
        .set("x-user-id", testData.users.customer.id)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe("GET /api/jobs/price-guidance/:categoryId", () => {
    it("should return price guidance for category", async () => {
      const response = await request(baseURL)
        .get(`/api/jobs/price-guidance/${testData.categories[0].id}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });
});
