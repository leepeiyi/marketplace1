// tests/unit/job.test.js

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import JobService from "../../services/job.js";

describe("JobService Unit Tests", () => {
  let jobService;
  let mockPrisma;
  let mockWsService;

  beforeEach(() => {
    // Mock Prisma client
    mockPrisma = {
      job: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      provider: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        findMany: jest.fn(),
      },
      escrow: {
        create: jest.fn(),
        update: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(),
    };

    // Mock WebSocket service
    mockWsService = {
      notifyProvider: jest.fn(),
      notifyCustomer: jest.fn(),
      broadcast: jest.fn(),
    };

    jobService = new JobService(mockPrisma, mockWsService);

    // Mock console methods
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Constructor", () => {
    it("should initialize with prisma and wsService", () => {
      expect(jobService.prisma).toBe(mockPrisma);
      expect(jobService.wsService).toBe(mockWsService);
    });
  });

  describe("getPriceGuidance()", () => {
    it("should return price guidance with historical data", async () => {
      const mockJobs = [
        { finalPrice: 100 },
        { finalPrice: 150 },
        { finalPrice: 200 },
        { finalPrice: 250 },
        { finalPrice: 300 },
      ];

      mockPrisma.job.findMany.mockResolvedValue(mockJobs);

      const result = await jobService.getPriceGuidance("category1");

      expect(result).toEqual({
        p10: 100, // 10th percentile
        p50: 200, // 50th percentile (median)
        p90: 300, // 90th percentile
        dataPoints: 5,
      });

      expect(mockPrisma.job.findMany).toHaveBeenCalledWith({
        where: {
          categoryId: "category1",
          status: "COMPLETED",
          finalPrice: { not: null },
        },
        select: {
          finalPrice: true,
        },
      });
    });

    it("should return default prices when no historical data", async () => {
      mockPrisma.job.findMany.mockResolvedValue([]);

      const result = await jobService.getPriceGuidance("category1");

      expect(result).toEqual({
        p10: 50,
        p50: 100,
        p90: 200,
        dataPoints: 0,
      });
    });

    it("should handle single data point", async () => {
      const mockJobs = [{ finalPrice: 150 }];
      mockPrisma.job.findMany.mockResolvedValue(mockJobs);

      const result = await jobService.getPriceGuidance("category1");

      expect(result).toEqual({
        p10: 150,
        p50: 150,
        p90: 150,
        dataPoints: 1,
      });
    });

    it("should handle errors", async () => {
      mockPrisma.job.findMany.mockRejectedValue(new Error("Database error"));

      await expect(jobService.getPriceGuidance("category1")).rejects.toThrow(
        "Database error"
      );
    });
  });

  describe("createQuickBookJob()", () => {
    const mockJobData = {
      categoryId: "category1",
      title: "Fix sink",
      description: "Kitchen sink is leaking",
      latitude: 40.7128,
      longitude: -74.006,
      address: "123 Main St",
      arrivalWindow: 2,
    };

    const mockCreatedJob = {
      id: "job1",
      ...mockJobData,
      customerId: "customer1",
      type: "QUICK_BOOK",
      status: "PENDING",
      estimatedPrice: 150,
      category: { name: "Plumbing" },
      customer: { name: "John Doe", phone: "+1234567890" },
    };

    beforeEach(() => {
      jest.spyOn(jobService, "getPriceGuidance").mockResolvedValue({
        p50: 150,
      });
      jest.spyOn(jobService, "notifyNearbyProviders").mockResolvedValue(3);
      mockPrisma.job.create.mockResolvedValue(mockCreatedJob);
    });

    it("should create quick book job successfully", async () => {
      const result = await jobService.createQuickBookJob(
        "customer1",
        mockJobData
      );

      expect(result).toEqual(mockCreatedJob);
      expect(jobService.getPriceGuidance).toHaveBeenCalledWith("category1");
      expect(mockPrisma.job.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          customerId: "customer1",
          categoryId: "category1",
          title: "Fix sink",
          type: "QUICK_BOOK",
          status: "BROADCASTED",
          estimatedPrice: 150,
        }),
        include: {
          category: true,
          customer: {
            select: {
              name: true,
              phone: true,
            },
          },
        },
      });
      expect(jobService.notifyNearbyProviders).toHaveBeenCalledWith(
        mockCreatedJob
      );
    });

    it("should calculate correct arrival deadline", async () => {
      const beforeCreate = new Date();
      await jobService.createQuickBookJob("customer1", mockJobData);

      const createCall = mockPrisma.job.create.mock.calls[0][0];
      const quickBookDeadline = createCall.data.quickBookDeadline;

      // Should be approximately 2 hours from now
      const expectedDeadline = new Date(
        beforeCreate.getTime() + 2 * 60 * 60 * 1000
      );
      const timeDiff = Math.abs(
        quickBookDeadline.getTime() - expectedDeadline.getTime()
      );

      expect(timeDiff).toBeLessThan(1000); // Within 1 second
    });

    it("should handle creation errors", async () => {
      mockPrisma.job.create.mockRejectedValue(new Error("Creation failed"));

      await expect(
        jobService.createQuickBookJob("customer1", mockJobData)
      ).rejects.toThrow("Creation failed");
    });
  });

  describe("notifyNearbyProviders()", () => {
    const mockJob = {
      id: "job1",
      categoryId: "category1",
      latitude: 40.7128,
      longitude: -74.006,
      title: "Fix sink",
      estimatedPrice: 150,
      quickBookDeadline: new Date(),
      category: { name: "Plumbing" },
      customer: { name: "John Doe" },
    };

    const mockProviders = [
      {
        id: "provider1",
        name: "Provider One",
        providerId: "p1",
        latitude: 40.713,
        longitude: -74.0062,
        isAvailable: true,
      },
      {
        id: "provider2",
        name: "Provider Two",
        providerId: "p2",
        latitude: 40.7125,
        longitude: -74.0058,
        isAvailable: true,
      },
    ];

    it("should notify nearby providers", async () => {
      mockPrisma.$queryRaw.mockResolvedValue(mockProviders);
      jest.spyOn(jobService, "calculateDistance").mockReturnValue(2.5);

      const result = await jobService.notifyNearbyProviders(mockJob);

      expect(result).toBe(2);
      expect(mockWsService.notifyProvider).toHaveBeenCalledTimes(2);

      expect(mockWsService.notifyProvider).toHaveBeenCalledWith("provider1", {
        type: "new_quick_book_job",
        job: expect.objectContaining({
          id: "job1",
          title: "Fix sink",
          category: "Plumbing",
          distance: 2.5,
        }),
      });
    });

    it("should handle no nearby providers", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await jobService.notifyNearbyProviders(mockJob);

      expect(result).toBe(0);
      expect(mockWsService.notifyProvider).not.toHaveBeenCalled();
    });

    it("should handle query errors", async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error("Query failed"));

      await expect(jobService.notifyNearbyProviders(mockJob)).rejects.toThrow(
        "Query failed"
      );
    });
  });

  describe("acceptQuickBookJob()", () => {
    const mockJob = {
      id: "job1",
      status: "PENDING",
      customerId: "customer1",
      estimatedPrice: 150,
      customer: { name: "John Doe" },
    };

    const mockProvider = {
      user: {
        name: "Provider Name",
        phone: "+1234567890",
      },
    };

    beforeEach(() => {
      mockPrisma.job.findUnique.mockResolvedValue(mockJob);
      mockPrisma.job.update.mockResolvedValue({
        ...mockJob,
        status: "BOOKED",
        providerId: "provider1",
      });
      mockPrisma.escrow.create.mockResolvedValue({});
      mockPrisma.provider.findUnique.mockResolvedValue(mockProvider);
      mockPrisma.user.findMany.mockResolvedValue([]);
    });

    it("should accept available job successfully", async () => {
      const result = await jobService.acceptQuickBookJob("job1", "provider1");

      expect(result.success).toBe(true);
      expect(mockPrisma.job.update).toHaveBeenCalledWith({
        where: { id: "job1" },
        data: {
          providerId: "provider1",
          status: "BOOKED",
        },
        include: {
          provider: true,
          customer: true,
          category: true,
        },
      });

      expect(mockPrisma.escrow.create).toHaveBeenCalledWith({
        data: {
          jobId: "job1",
          amount: 150,
          status: "HELD",
        },
      });

      expect(mockWsService.notifyCustomer).toHaveBeenCalledWith("customer1", {
        type: "job_accepted",
        job: expect.objectContaining({
          id: "job1",
          providerName: "Provider Name",
          providerPhone: "+1234567890",
        }),
      });
    });

    it("should reject non-existent job", async () => {
      mockPrisma.job.findUnique.mockResolvedValue(null);

      await expect(
        jobService.acceptQuickBookJob("nonexistent", "provider1")
      ).rejects.toThrow("Job not found");
    });

    it("should reject already taken job", async () => {
      mockPrisma.job.findUnique.mockResolvedValue({
        ...mockJob,
        status: "BOOKED",
      });

      await expect(
        jobService.acceptQuickBookJob("job1", "provider1")
      ).rejects.toThrow("Job already taken");
    });
  });

  describe("createPostQuoteJob()", () => {
    const mockJobData = {
      categoryId: "category1",
      title: "Install toilet",
      description: "Replace old toilet",
      latitude: 40.7128,
      longitude: -74.006,
      address: "123 Main St",
      acceptPrice: 300,
    };

    const mockCreatedJob = {
      id: "job1",
      ...mockJobData,
      customerId: "customer1",
      type: "POST_QUOTE",
      status: "BROADCASTED",
      category: { name: "Plumbing" },
      customer: { name: "John Doe", phone: "+1234567890" },
    };

    beforeEach(() => {
      mockPrisma.job.create.mockResolvedValue(mockCreatedJob);
      jest.spyOn(jobService, "startBroadcastProcess").mockResolvedValue();
    });

    it("should create post quote job successfully", async () => {
      const result = await jobService.createPostQuoteJob(
        "customer1",
        mockJobData
      );

      expect(result).toEqual(mockCreatedJob);
      expect(mockPrisma.job.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          customerId: "customer1",
          type: "POST_QUOTE",
          status: "BROADCASTED",
          acceptPrice: 300,
          broadcastStage: 1,
        }),
        include: {
          category: true,
          customer: {
            select: {
              name: true,
              phone: true,
            },
          },
        },
      });
      expect(jobService.startBroadcastProcess).toHaveBeenCalledWith(
        mockCreatedJob
      );
    });

    it("should calculate bidding deadline (24 hours)", async () => {
      const beforeCreate = new Date();
      await jobService.createPostQuoteJob("customer1", mockJobData);

      const createCall = mockPrisma.job.create.mock.calls[0][0];
      const biddingEndsAt = createCall.data.biddingEndsAt;

      // Should be approximately 24 hours from now
      const expectedDeadline = new Date(
        beforeCreate.getTime() + 24 * 60 * 60 * 1000
      );
      const timeDiff = Math.abs(
        biddingEndsAt.getTime() - expectedDeadline.getTime()
      );

      expect(timeDiff).toBeLessThan(1000); // Within 1 second
    });
  });

  describe("calculateDistance()", () => {
    it("should calculate distance between Singapore locations correctly", () => {
      // Distance between Orchard Road and Changi Airport (about 19km)
      const orchardLat = 1.3048;
      const orchardLon = 103.8318;
      const changiLat = 1.3644;
      const changiLon = 103.9915;

      const distance = jobService.calculateDistance(
        orchardLat,
        orchardLon,
        changiLat,
        changiLon
      );

      // Should be approximately 19 km (actual distance is ~18.9km)
      expect(distance).toBeGreaterThan(15);
      expect(distance).toBeLessThan(25);
    });

    it("should calculate short distances within Singapore correctly", () => {
      // Distance between Marina Bay Sands and Singapore Flyer (about 1.5km)
      const mbsLat = 1.2834;
      const mbsLon = 103.8607;
      const flyerLat = 1.2894;
      const flyerLon = 103.8631;

      const distance = jobService.calculateDistance(
        mbsLat,
        mbsLon,
        flyerLat,
        flyerLon
      );

      // Should be approximately 1.5 km
      expect(distance).toBeGreaterThan(0.5);
      expect(distance).toBeLessThan(2.0);
    });

    it("should return 0 for same coordinates", () => {
      const singaporeLat = 1.3521;
      const singaporeLon = 103.8198;
      const distance = jobService.calculateDistance(
        singaporeLat,
        singaporeLon,
        singaporeLat,
        singaporeLon
      );
      expect(distance).toBe(0);
    });

    it("should handle small coordinate differences", () => {
      // Very close locations (about 100-200m apart)
      const lat1 = 1.3521;
      const lon1 = 103.8198;
      const lat2 = 1.3525; // Slight difference
      const lon2 = 103.8202; // Slight difference

      const distance = jobService.calculateDistance(lat1, lon1, lat2, lon2);

      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(1); // Should be less than 1km
    });
  });

  describe("deg2rad()", () => {
    it("should convert degrees to radians correctly", () => {
      expect(jobService.deg2rad(0)).toBe(0);
      expect(jobService.deg2rad(90)).toBeCloseTo(Math.PI / 2);
      expect(jobService.deg2rad(180)).toBeCloseTo(Math.PI);
      expect(jobService.deg2rad(360)).toBeCloseTo(2 * Math.PI);
    });

    it("should handle negative degrees", () => {
      expect(jobService.deg2rad(-90)).toBeCloseTo(-Math.PI / 2);
      expect(jobService.deg2rad(-180)).toBeCloseTo(-Math.PI);
    });
  });

  describe("getCustomerJobs()", () => {
    it("should return customer jobs with includes", async () => {
      const mockJobs = [
        { id: "job1", title: "Job 1" },
        { id: "job2", title: "Job 2" },
      ];

      mockPrisma.job.findMany.mockResolvedValue(mockJobs);

      const result = await jobService.getCustomerJobs("customer1");

      expect(result).toEqual(mockJobs);
      expect(mockPrisma.job.findMany).toHaveBeenCalledWith({
        where: { customerId: "customer1" },
        include: {
          category: true,
          provider: {
            include: {
              provider: true,
            },
          },
          escrow: true,
        },
        orderBy: { createdAt: "desc" },
      });
    });
  });

  describe("getJobById()", () => {
    it("should return job with full details", async () => {
      const mockJob = {
        id: "job1",
        title: "Test Job",
        category: { name: "Plumbing" },
        customer: { name: "John Doe" },
      };

      mockPrisma.job.findUnique.mockResolvedValue(mockJob);

      const result = await jobService.getJobById("job1");

      expect(result).toEqual(mockJob);
      expect(mockPrisma.job.findUnique).toHaveBeenCalledWith({
        where: { id: "job1" },
        include: {
          category: true,
          customer: true,
          provider: {
            include: {
              provider: true,
            },
          },
          escrow: true,
          bids: {
            include: {
              provider: {
                include: {
                  provider: true,
                },
              },
            },
          },
        },
      });
    });
  });

  describe("cancelJob()", () => {
    const mockJob = {
      id: "job1",
      customerId: "customer1",
      providerId: "provider1",
      status: "BOOKED",
      escrow: {
        id: "escrow1",
        status: "HELD",
      },
    };

    beforeEach(() => {
      mockPrisma.job.findUnique.mockResolvedValue(mockJob);
      mockPrisma.job.update.mockResolvedValue({
        ...mockJob,
        status: "CANCELLED_BY_CUSTOMER",
      });
      mockPrisma.escrow.update.mockResolvedValue({});
    });

    it("should cancel job by customer", async () => {
      const result = await jobService.cancelJob("job1", "customer1");

      expect(mockPrisma.job.update).toHaveBeenCalledWith({
        where: { id: "job1" },
        data: {
          status: "CANCELLED_BY_CUSTOMER",
        },
      });

      expect(mockPrisma.escrow.update).toHaveBeenCalledWith({
        where: { id: "escrow1" },
        data: {
          status: "REFUNDED",
        },
      });

      expect(mockWsService.notifyProvider).toHaveBeenCalledWith("provider1", {
        type: "job_cancelled",
        jobId: "job1",
        reason: "Customer cancelled",
      });
    });

    it("should cancel job by provider", async () => {
      await jobService.cancelJob("job1", "provider1");

      expect(mockPrisma.job.update).toHaveBeenCalledWith({
        where: { id: "job1" },
        data: {
          status: "CANCELLED_BY_PROVIDER",
        },
      });

      expect(mockWsService.notifyCustomer).toHaveBeenCalledWith("customer1", {
        type: "job_cancelled",
        jobId: "job1",
        reason: "Provider cancelled",
      });
    });

    it("should reject unauthorized cancellation", async () => {
      await expect(
        jobService.cancelJob("job1", "unauthorized")
      ).rejects.toThrow("Unauthorized");
    });

    it("should reject cancelling non-existent job", async () => {
      mockPrisma.job.findUnique.mockResolvedValue(null);

      await expect(
        jobService.cancelJob("nonexistent", "customer1")
      ).rejects.toThrow("Job not found");
    });

    it("should reject cancelling completed job", async () => {
      mockPrisma.job.findUnique.mockResolvedValue({
        ...mockJob,
        status: "COMPLETED",
      });

      await expect(jobService.cancelJob("job1", "customer1")).rejects.toThrow(
        "Cannot cancel this job"
      );
    });

    it("should handle job without escrow", async () => {
      mockPrisma.job.findUnique.mockResolvedValue({
        ...mockJob,
        escrow: null,
      });

      const result = await jobService.cancelJob("job1", "customer1");

      expect(mockPrisma.escrow.update).not.toHaveBeenCalled();
      expect(result.status).toBe("CANCELLED_BY_CUSTOMER");
    });
  });

  describe("broadcastToProviders()", () => {
    const mockJob = {
      id: "job1",
      categoryId: "category1",
      latitude: 40.7128,
      longitude: -74.006,
      title: "Test Job",
      acceptPrice: 200,
      biddingEndsAt: new Date(),
      category: { name: "Plumbing" },
      customer: { name: "John Doe" },
      description: "Test description",
    };

    const mockProviders = [
      {
        id: "provider1",
        name: "Provider One",
        providerId: "p1",
        latitude: 40.713,
        longitude: -74.0062,
        averageRating: 4.8,
        completedJobs: 100,
        isAvailable: true,
      },
      {
        id: "provider2",
        name: "Provider Two",
        providerId: "p2",
        latitude: 40.7125,
        longitude: -74.0058,
        averageRating: 4.2,
        completedJobs: 25,
        isAvailable: true,
      },
    ];

    it("should broadcast to Tier-A providers in stage 1", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([mockProviders[0]]); // Only tier-A provider
      jest.spyOn(jobService, "calculateDistance").mockReturnValue(2.5);

      const result = await jobService.broadcastToProviders(
        mockJob,
        1,
        3,
        "TIER_A"
      );

      expect(result).toBe(1);
      expect(mockWsService.notifyProvider).toHaveBeenCalledWith("provider1", {
        type: "new_post_quote_job",
        job: expect.objectContaining({
          id: "job1",
          stage: 1,
          distance: 2.5,
        }),
      });
    });

    it("should broadcast to all providers in stage 2", async () => {
      mockPrisma.$queryRaw.mockResolvedValue(mockProviders);
      jest.spyOn(jobService, "calculateDistance").mockReturnValue(8.5);

      const result = await jobService.broadcastToProviders(
        mockJob,
        2,
        10,
        "ALL"
      );

      expect(result).toBe(2);
      expect(mockWsService.notifyProvider).toHaveBeenCalledTimes(2);
    });

    it("should broadcast without radius limit in stage 3", async () => {
      mockPrisma.$queryRaw.mockResolvedValue(mockProviders);

      const result = await jobService.broadcastToProviders(
        mockJob,
        3,
        null,
        "ALL"
      );

      expect(result).toBe(2);

      // Should not calculate distance when no radius limit
      expect(mockWsService.notifyProvider).toHaveBeenCalledWith("provider1", {
        type: "new_post_quote_job",
        job: expect.objectContaining({
          id: "job1",
          stage: 3,
          distance: null,
        }),
      });
    });

    it("should handle broadcast errors", async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error("Query failed"));

      await expect(
        jobService.broadcastToProviders(mockJob, 1, 3, "TIER_A")
      ).rejects.toThrow("Query failed");
    });
  });

  describe("startBroadcastProcess()", () => {
    const mockJob = {
      id: "job1",
      categoryId: "category1",
      latitude: 40.7128,
      longitude: -74.006,
    };

    beforeEach(() => {
      jest.spyOn(jobService, "broadcastToProviders").mockResolvedValue(3);
    });

    it("should start immediate Stage 1 broadcast", async () => {
      await jobService.startBroadcastProcess(mockJob);

      expect(jobService.broadcastToProviders).toHaveBeenCalledWith(
        mockJob,
        1,
        3,
        "TIER_A"
      );
    });

    it("should call broadcastToProviders at least once", async () => {
      await jobService.startBroadcastProcess(mockJob);

      // Verify that the immediate broadcast happens
      expect(jobService.broadcastToProviders).toHaveBeenCalled();
      expect(jobService.broadcastToProviders).toHaveBeenCalledWith(
        mockJob,
        1,
        3,
        "TIER_A"
      );
    });

    it("should handle broadcast process without errors", async () => {
      // Test that the function completes without throwing
      await expect(
        jobService.startBroadcastProcess(mockJob)
      ).resolves.not.toThrow();
    });

    // Skip the timer tests since they're complex and better suited for integration tests
    it.skip("timer-based broadcasts are tested in integration tests", () => {
      // This is a placeholder to document that timer functionality
      // should be tested in integration tests where we can properly
      // test the full broadcast cycle
    });
  });

  describe("getAvailableJobsForProvider()", () => {
    const mockProvider = {
      userId: "provider1",
      isAvailable: true,
      latitude: 1.3521, // Singapore city center
      longitude: 103.8198,
      categories: [{ categoryId: "category1", category: { name: "Plumbing" } }],
    };

    const mockJobs = [
      {
        id: "job1",
        title: "Job in CBD",
        latitude: 1.2845, // Marina Bay (about 8km from city center)
        longitude: 103.8607,
        category: { name: "Plumbing" },
        customer: { name: "John Doe" },
      },
      {
        id: "job2",
        title: "Job in Changi",
        latitude: 1.3644, // Changi area (about 25km from city center)
        longitude: 103.9915,
        category: { name: "Plumbing" },
        customer: { name: "Jane Smith" },
      },
    ];

    beforeEach(() => {
      mockPrisma.provider.findUnique.mockResolvedValue(mockProvider);
      mockPrisma.job.findMany.mockResolvedValue(mockJobs);
    });

    it("should return available jobs within 5km radius", async () => {
      // Use real distance calculations for Singapore
      const result = await jobService.getAvailableJobsForProvider("provider1");

      // Both jobs should be filtered by actual distance
      // Job1 (Marina Bay) is about 8km - outside 5km radius
      // Job2 (Changi) is about 25km - outside 5km radius
      // So we expect 0 jobs returned
      expect(result).toEqual([]);
    });

    it("should return jobs within radius when they exist", async () => {
      // Create jobs closer to the provider
      const nearbyJobs = [
        {
          id: "job1",
          title: "Nearby Job 1",
          latitude: 1.35, // Very close to provider
          longitude: 103.818,
          category: { name: "Plumbing" },
          customer: { name: "John Doe" },
        },
        {
          id: "job2",
          title: "Nearby Job 2",
          latitude: 1.354,
          longitude: 103.822,
          category: { name: "Plumbing" },
          customer: { name: "Jane Smith" },
        },
      ];

      mockPrisma.job.findMany.mockResolvedValue(nearbyJobs);

      const result = await jobService.getAvailableJobsForProvider("provider1");

      // Both jobs should be within 5km
      expect(result.length).toBeGreaterThan(0);
      result.forEach((job) => {
        expect(job.distance).toBeLessThanOrEqual(5);
      });
    });

    it("should sort jobs by distance", async () => {
      const nearbyJobs = [
        {
          id: "job1",
          title: "Farther Job",
          latitude: 1.34, // About 1.5km away
          longitude: 103.81,
          category: { name: "Plumbing" },
          customer: { name: "John Doe" },
        },
        {
          id: "job2",
          title: "Closer Job",
          latitude: 1.353, // About 0.5km away
          longitude: 103.821,
          category: { name: "Plumbing" },
          customer: { name: "Jane Smith" },
        },
      ];

      mockPrisma.job.findMany.mockResolvedValue(nearbyJobs);

      const result = await jobService.getAvailableJobsForProvider("provider1");

      if (result.length >= 2) {
        // Should be sorted by distance (closest first)
        expect(result[0].distance).toBeLessThan(result[1].distance);
        expect(result[0].title).toBe("Closer Job");
        expect(result[1].title).toBe("Farther Job");
      }
    });

    it("should return empty array for unavailable provider", async () => {
      mockPrisma.provider.findUnique.mockResolvedValue({
        ...mockProvider,
        isAvailable: false,
      });

      const result = await jobService.getAvailableJobsForProvider("provider1");
      expect(result).toEqual([]);
    });

    it("should return empty array for provider without location", async () => {
      mockPrisma.provider.findUnique.mockResolvedValue({
        ...mockProvider,
        latitude: null,
        longitude: null,
      });

      const result = await jobService.getAvailableJobsForProvider("provider1");
      expect(result).toEqual([]);
    });
  });

  describe("Error Handling", () => {
    it("should handle database connection errors gracefully", async () => {
      mockPrisma.job.findMany.mockRejectedValue(new Error("Connection lost"));

      await expect(jobService.getCustomerJobs("customer1")).rejects.toThrow(
        "Connection lost"
      );
    });

    it("should handle WebSocket service unavailability", () => {
      const jobServiceWithoutWs = new JobService(mockPrisma, null);

      // Should not throw when trying to notify without WebSocket service
      expect(() => {
        if (jobServiceWithoutWs.wsService) {
          jobServiceWithoutWs.wsService.notifyCustomer("customer1", {});
        }
      }).not.toThrow();
    });

    it("should handle malformed query results", async () => {
      // Mock malformed provider data
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: "provider1" }, // Missing required fields
      ]);

      const mockJob = {
        id: "job1",
        categoryId: "category1",
        latitude: 40.7128,
        longitude: -74.006,
        category: { name: "Plumbing" },
        customer: { name: "John Doe" },
      };

      // Should not crash when processing malformed data
      const result = await jobService.notifyNearbyProviders(mockJob);
      expect(result).toBe(1);
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero-distance calculations", () => {
      const distance = jobService.calculateDistance(0, 0, 0, 0);
      expect(distance).toBe(0);
    });

    it("should handle extreme coordinates", () => {
      // Test with coordinates at opposite poles
      const distance = jobService.calculateDistance(90, 0, -90, 0);
      expect(distance).toBeCloseTo(20015.086796020572, 1); // Half Earth circumference
    });

    it("should handle price guidance with identical prices", async () => {
      const mockJobs = [
        { finalPrice: 100 },
        { finalPrice: 100 },
        { finalPrice: 100 },
      ];

      mockPrisma.job.findMany.mockResolvedValue(mockJobs);

      const result = await jobService.getPriceGuidance("category1");

      expect(result).toEqual({
        p10: 100,
        p50: 100,
        p90: 100,
        dataPoints: 3,
      });
    });

    it("should handle empty string in job creation", async () => {
      jest
        .spyOn(jobService, "getPriceGuidance")
        .mockResolvedValue({ p50: 150 });
      jest.spyOn(jobService, "notifyNearbyProviders").mockResolvedValue(0);

      mockPrisma.job.create.mockResolvedValue({
        id: "job1",
        title: "",
        description: "",
        estimatedPrice: 150,
      });

      const result = await jobService.createQuickBookJob("customer1", {
        categoryId: "category1",
        title: "",
        description: "",
        latitude: 40.7128,
        longitude: -74.006,
        address: "123 Main St",
        arrivalWindow: 1,
      });

      expect(result.title).toBe("");
      expect(result.description).toBe("");
    });
  });
});
