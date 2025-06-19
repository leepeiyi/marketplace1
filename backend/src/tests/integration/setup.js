import { beforeAll, afterAll, beforeEach } from "@jest/globals";
import { PrismaClient } from "@prisma/client";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import { WebSocketService } from "../../services/websocket.js";

// Import your routes
import { userRoutes } from "../../routes/users.js";
import { jobRoutes } from "../../routes/jobs.js";
import { categoryRoutes } from "../../routes/categories.js";
import { bidRoutes } from "../../routes/bids.js";
import { escrowRoutes } from "../../routes/escrow.js";

export class TestServer {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.prisma = new PrismaClient();
    this.wsService = new WebSocketService();
  }

  async setup() {
    // Initialize WebSocket service
    this.wsService.initialize(this.server);

    // Middleware
    this.app.use(
      cors({
        origin: "http://localhost:3000",
        credentials: true,
      })
    );
    this.app.use(express.json());

    // Add Prisma and WebSocket service to request object
    this.app.use((req, res, next) => {
      req.prisma = this.prisma;
      req.wsService = this.wsService;
      next();
    });

    this.app.set("wsService", this.wsService);

    // API Routes
    this.app.use("/api/users", userRoutes);
    this.app.use("/api/jobs", jobRoutes);
    this.app.use("/api/categories", categoryRoutes);
    this.app.use("/api/bids", bidRoutes);
    this.app.use("/api/escrow", escrowRoutes);

    this.app.get("/api/ws/stats", (req, res) => {
      res.json(this.wsService.getStats());
    });

    // Start server on random port
    return new Promise((resolve) => {
      this.server.listen(0, () => {
        const port = this.server.address().port;
        this.baseURL = `http://localhost:${port}`;
        console.log(`Test server running on ${this.baseURL}`);
        resolve(port);
      });
    });
  }

  async cleanup() {
    // **FIXED: Clean up database in correct order to respect foreign key constraints**
    try {
      console.log("Starting database cleanup...");

      // 1. Delete records that don't reference anything else first
      await this.prisma.review.deleteMany();

      // 2. Delete escrow records (references jobs)
      await this.prisma.escrow.deleteMany();

      // 3. Delete bids (references jobs and users)
      await this.prisma.bid.deleteMany();

      // 4. Delete price history BEFORE categories (this was causing the FK constraint error)
      await this.prisma.priceHistory.deleteMany();

      // 5. Delete jobs (references users and categories)
      await this.prisma.job.deleteMany();

      // 6. Delete provider-category relationships (references providers and categories)
      await this.prisma.providerCategory.deleteMany();

      // 7. Delete providers BEFORE users (provider has FK to user)
      await this.prisma.provider.deleteMany();

      // 8. Delete users
      await this.prisma.user.deleteMany();

      // 9. Finally delete categories (no more FK references)
      await this.prisma.category.deleteMany();

      console.log("Database cleanup completed successfully");
    } catch (error) {
      console.error("Cleanup error:", error);
      // Don't throw to avoid cascading test failures
    }
  }

  async teardown() {
    await this.cleanup();
    await this.prisma.$disconnect();
    this.wsService.close();

    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }

  getBaseURL() {
    return this.baseURL;
  }

  async seedTestData() {
    try {
      console.log("Seeding test data...");

      // Create categories with upsert to avoid duplicates
      const category1 = await this.prisma.category.upsert({
        where: { name: "Plumbing" },
        update: {},
        create: {
          id: "cat-plumbing",
          name: "Plumbing",
          description: "Professional plumbing services",
          icon: "🔧",
          isActive: true,
        },
      });

      const category2 = await this.prisma.category.upsert({
        where: { name: "Electrical" },
        update: {},
        create: {
          id: "cat-electrical",
          name: "Electrical",
          description: "Professional electrical services",
          icon: "⚡",
          isActive: true,
        },
      });

      // Create customer user
      const customer = await this.prisma.user.upsert({
        where: { email: "customer@test.com" },
        update: {},
        create: {
          id: "customer-1",
          email: "customer@test.com",
          name: "Test Customer",
          phone: "+65 9123 4567",
          role: "CUSTOMER",
        },
      });

      // Create provider user
      const providerUser = await this.prisma.user.upsert({
        where: { email: "provider@test.com" },
        update: {},
        create: {
          id: "provider-user-1",
          email: "provider@test.com",
          name: "Test Provider",
          phone: "+65 9123 4568",
          role: "PROVIDER",
        },
      });

      const provider = await this.prisma.provider.upsert({
        where: { userId: providerUser.id },
        update: {},
        create: {
          id: "provider-1",
          userId: providerUser.id,
          // Required fields from your schema
          isAvailable: true,
          latitude: 1.3521, // Singapore city center
          longitude: 103.8198,
          completedJobs: 10,
          averageRating: 4.5,
          totalRatings: 10,
          tier: "TIER_A",
          reliabilityScore: 95.0,
        },
      });

      // Link provider to categories
      await this.prisma.providerCategory.upsert({
        where: {
          providerId_categoryId: {
            providerId: provider.id,
            categoryId: category1.id,
          },
        },
        update: {},
        create: {
          providerId: provider.id,
          categoryId: category1.id,
        },
      });

      // Create price history
      await this.prisma.priceHistory.upsert({
        where: {
          id: "price-history-1", // Add a unique identifier
        },
        update: {},
        create: {
          id: "price-history-1",
          categoryId: category1.id,
          price: 150,
          completedAt: new Date(),
        },
      });

      console.log("Test data seeded successfully");

      return {
        categories: [category1, category2],
        category1, // For direct access
        category2, // For direct access
        users: { customer, providerUser },
        customer, // For direct access
        providerUser, // For direct access
        homeowner: customer, // Alias for backward compatibility
        provider,
        priceHistory: await this.prisma.priceHistory.findFirst({
          where: { categoryId: category1.id },
        }),
      };
    } catch (error) {
      console.error("Seed data error:", error);
      throw error;
    }
  }

  async createTestJob(testData, jobData = {}) {
    const defaultJobData = {
      categoryId: testData.category1.id,
      customerId: testData.customer.id,
      title: "Test job for bidding",
      description: "Test description for integration tests",
      type: "POST_QUOTE",
      status: "BROADCASTED",
      latitude: 1.3521,
      longitude: 103.8198,
      address: "123 Test Street, Singapore",
    };

    return await this.prisma.job.create({
      data: {
        ...defaultJobData,
        ...jobData,
      },
    });
  }

  async createTestBid(jobId, providerId, bidData = {}) {
    const defaultBidData = {
      price: 200,
      estimatedEta: 60,
      status: "PENDING",
    };

    return await this.prisma.bid.create({
      data: {
        jobId,
        providerId,
        ...defaultBidData,
        ...bidData,
      },
    });
  }

  async createAdditionalProvider(userData = {}, providerData = {}) {
    const defaultUserData = {
      email: `provider-${Date.now()}@test.com`,
      name: "Additional Test Provider",
      phone: "+65 9999 0000",
      role: "PROVIDER",
    };

    const user = await this.prisma.user.create({
      data: {
        ...defaultUserData,
        ...userData,
      },
    });

    const defaultProviderData = {
      isAvailable: true,
      latitude: 1.3521,
      longitude: 103.8198,
      completedJobs: 5,
      averageRating: 4.0,
      totalRatings: 5,
      tier: "TIER_B",
      reliabilityScore: 85.0,
    };

    const provider = await this.prisma.provider.create({
      data: {
        userId: user.id,
        ...defaultProviderData,
        ...providerData,
      },
    });

    return { user, provider };
  }
}
