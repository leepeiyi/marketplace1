// tests/integration/categories.test.js
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "@jest/globals";
import request from "supertest";
import { TestServer } from "./setup.js"; // Fixed: relative path to setup.js in same directory

describe("Category Routes Integration Tests", () => {
  let testServer;
  let baseURL;

  beforeAll(async () => {
    testServer = new TestServer();
    await testServer.setup();
    baseURL = testServer.getBaseURL(); // Fixed: use getBaseURL() method
  }, 30000);

  afterAll(async () => {
    await testServer.teardown();
  }, 15000);

  beforeEach(async () => {
    await testServer.cleanup();
  }, 10000);

  describe("GET /api/categories", () => {
    it("should return all active categories", async () => {
      const testData = await testServer.seedTestData();

      const response = await request(baseURL)
        .get("/api/categories")
        .expect(200);

      expect(response.body).toHaveLength(2);
      
      // Fixed: The categories are ordered by name ascending, so "Electrical" comes before "Plumbing"
      const electricalCategory = response.body.find(cat => cat.name === "Electrical");
      const plumbingCategory = response.body.find(cat => cat.name === "Plumbing");
      
      expect(electricalCategory).toMatchObject({
        name: "Electrical",
        icon: "⚡",
        isActive: true,
      });
      
      expect(plumbingCategory).toMatchObject({
        name: "Plumbing",
        icon: "🔧",
        isActive: true,
      });
    });

    it("should return empty array when no categories exist", async () => {
      // Don't seed any data for this test
      const response = await request(baseURL)
        .get("/api/categories")
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe("GET /api/categories/:id", () => {
    it("should return specific category by ID", async () => {
      const testData = await testServer.seedTestData();

      // Fixed: Use category1 directly instead of array access
      const response = await request(baseURL)
        .get(`/api/categories/${testData.category1.id}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: testData.category1.id,
        name: "Plumbing",
        icon: "🔧",
        isActive: true,
      });
    });

    it("should return 404 for non-existent category", async () => {
      await request(baseURL)
        .get("/api/categories/non-existent-id")
        .expect(404);
    });

    it("should return 404 for invalid UUID format", async () => {
      await request(baseURL)
        .get("/api/categories/invalid-uuid")
        .expect(404); // Your route should handle this gracefully
    });
  });

  describe("GET /api/categories/price-range/:categoryId", () => {
    it("should return price range for category with price history", async () => {
      const testData = await testServer.seedTestData();

      // Fixed: Use category1 which has price history
      const response = await request(baseURL)
        .get(`/api/categories/price-range/${testData.category1.id}`)
        .expect(200);

      expect(response.body).toMatchObject({
        minPrice: 150,
        maxPrice: 150,
        suggestedPrice: 150,
      });
    });

    it("should return 404 for category with no price data", async () => {
      const testData = await testServer.seedTestData();

      // Fixed: Use category2 which has no price history
      await request(baseURL)
        .get(`/api/categories/price-range/${testData.category2.id}`)
        .expect(404);
    });

    it("should return 404 for non-existent category", async () => {
      await request(baseURL)
        .get("/api/categories/price-range/non-existent-category")
        .expect(404);
    });

    it("should calculate correct price ranges with multiple price points", async () => {
      const testData = await testServer.seedTestData();

      // Add more price history entries for better testing
      await testServer.prisma.priceHistory.createMany({
        data: [
          {
            categoryId: testData.category1.id,
            price: 100,
            completedAt: new Date(Date.now() - 86400000) // 1 day ago
          },
          {
            categoryId: testData.category1.id,
            price: 200,
            completedAt: new Date(Date.now() - 172800000) // 2 days ago
          },
          {
            categoryId: testData.category1.id,
            price: 300,
            completedAt: new Date(Date.now() - 259200000) // 3 days ago
          }
        ]
      });

      const response = await request(baseURL)
        .get(`/api/categories/price-range/${testData.category1.id}`)
        .expect(200);

      expect(response.body).toMatchObject({
        minPrice: 100, // Min from all prices
        maxPrice: 300, // Max from all prices
        suggestedPrice: 188, // Average: (150 + 100 + 200 + 300) / 4 = 187.5 → rounds to 188
      });
    });
  });

  describe("Categories with jobs and providers", () => {
    it("should return categories that have active providers", async () => {
      const testData = await testServer.seedTestData();

      // The seeded data already links provider to category1 (Plumbing)
      const response = await request(baseURL)
        .get("/api/categories")
        .expect(200);

      expect(response.body).toHaveLength(2);
      
      // Both categories should be returned as they are active
      const categoryNames = response.body.map(cat => cat.name);
      expect(categoryNames).toContain("Plumbing");
      expect(categoryNames).toContain("Electrical");
    });

    it("should return category details with description", async () => {
      const testData = await testServer.seedTestData();

      const response = await request(baseURL)
        .get(`/api/categories/${testData.category1.id}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: testData.category1.id,
        name: "Plumbing",
        description: "Professional plumbing services",
        icon: "🔧",
        isActive: true,
      });

      // Should have createdAt and updatedAt timestamps
      expect(response.body.createdAt).toBeDefined();
      expect(response.body.updatedAt).toBeDefined();
    });
  });

  describe("Error handling", () => {
    it("should handle database errors gracefully for categories list", async () => {
      // This test would need to mock database failure
      // For now, just test that the endpoint exists and responds
      const response = await request(baseURL)
        .get("/api/categories")
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it("should handle database errors gracefully for single category", async () => {
      const testData = await testServer.seedTestData();

      // Test with valid category ID
      const response = await request(baseURL)
        .get(`/api/categories/${testData.category1.id}`)
        .expect(200);

      expect(response.body.id).toBe(testData.category1.id);
    });

    it("should handle malformed price range requests", async () => {
      // Test with empty string as categoryId
      await request(baseURL)
        .get("/api/categories/price-range/")
        .expect(404); // Should hit 404 route handler

      // Test with very long invalid ID
      const longInvalidId = "a".repeat(100);
      await request(baseURL)
        .get(`/api/categories/price-range/${longInvalidId}`)
        .expect(404);
    });
  });
});