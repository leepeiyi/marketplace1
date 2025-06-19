// tests/integration/users.test.js
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "@jest/globals";
import request from "supertest";
import { TestServer } from './setup.js';

describe("User Routes Integration Tests", () => {
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

  describe("POST /api/users", () => {
    it("should create a new customer user", async () => {
      const userData = {
        email: "newcustomer@test.com",
        name: "New Customer",
        phone: "+1234567892",
        role: "CUSTOMER",
      };

      const response = await request(baseURL)
        .post("/api/users")
        .send(userData)
        .expect(201);

      expect(response.body).toMatchObject({
        email: userData.email,
        name: userData.name,
        role: userData.role,
      });
      expect(response.body.id).toBeDefined();
    });

    it("should create a new provider user", async () => {
      const userData = {
        email: "newprovider@test.com",
        name: "New Provider",
        role: "PROVIDER",
      };

      const response = await request(baseURL)
        .post("/api/users")
        .send(userData)
        .expect(201);

      expect(response.body).toMatchObject(userData);
    });

    it("should update existing user when email already exists", async () => {
      const userData = {
        email: "existing@test.com",
        name: "Original Name",
        role: "CUSTOMER",
      };

      // Create user first
      await request(baseURL).post("/api/users").send(userData).expect(201);

      // Update with same email
      const updatedData = {
        ...userData,
        name: "Updated Name",
      };

      const response = await request(baseURL)
        .post("/api/users")
        .send(updatedData)
        .expect(201);

      expect(response.body.name).toBe("Updated Name");
    });

    it("should return 400 for invalid user data", async () => {
      const invalidData = {
        email: "invalid-email",
        name: "",
        role: "INVALID_ROLE",
      };

      const response = await request(baseURL)
        .post("/api/users")
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe("Invalid request body");
      expect(response.body.details).toBeDefined();
    });
  });

  describe("GET /api/users/profile", () => {
    it("should get user profile with provider details", async () => {
      const testData = await testServer.seedTestData();

      const response = await request(baseURL)
        .get("/api/users/profile")
        .set("x-user-id", testData.users.providerUser.id)
        .expect(200);

      expect(response.body).toMatchObject({
        id: testData.users.providerUser.id,
        email: testData.users.providerUser.email,
        name: testData.users.providerUser.name,
        role: "PROVIDER",
      });
      expect(response.body.provider).toBeDefined();
      expect(response.body.provider.categories).toHaveLength(1);
    });

    it("should return 401 without user ID header", async () => {
      await request(baseURL).get("/api/users/profile").expect(401);
    });

    it("should return 404 for non-existent user", async () => {
      await request(baseURL)
        .get("/api/users/profile")
        .set("x-user-id", "non-existent")
        .expect(404);
    });
  });

  describe("GET /api/users/by-email/:email", () => {
    it("should get user by email", async () => {
      const testData = await testServer.seedTestData();

      const response = await request(baseURL)
        .get(`/api/users/by-email/${testData.users.customer.email}`)
        .expect(200);

      expect(response.body).toMatchObject({
        email: testData.users.customer.email,
        name: testData.users.customer.name,
      });
    });

    it("should return 404 for non-existent email", async () => {
      await request(baseURL)
        .get("/api/users/by-email/nonexistent@test.com")
        .expect(404);
    });
  });
});
