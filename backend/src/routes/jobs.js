import { Router } from "express";
import { z } from "zod";
import JobService from "../services/job.js";

const router = Router();

const CreateQuickBookJobSchema = z.object({
  categoryId: z.string(),
  title: z.string().min(1),
  description: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
  address: z.string().min(1),
  arrivalWindow: z.number().min(1).max(24), // hours from now
});

const CreatePostQuoteJobSchema = z.object({
  categoryId: z.string(),
  title: z.string().min(1),
  description: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
  address: z.string().min(1),
  acceptPrice: z.number().positive().optional(),
});

const AcceptJobSchema = z.object({
  jobId: z.string(),
});

// Validation middleware
const validateBody = (schema) => {
  return (req, res, next) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      return res.status(400).json({
        error: "Invalid request body",
        details: error.errors,
      });
    }
  };
};

// Authentication middleware
const requireAuth = (req, res, next) => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    return res.status(401).json({ error: "User ID required" });
  }
  req.userId = userId;
  next();
};

router.get("/test", (req, res) => {
  console.log("🧪 Test route hit!");
  res.json({ message: "Jobs route is working!" });
});

// Get available jobs for provider (within radius) - UPDATED VERSION
router.get("/available", requireAuth, async (req, res) => {
  try {
    const providerId = req.userId;

    console.log("🚀 Available jobs route hit!"); // This should show up
    console.log("📝 Headers:", req.headers);
    console.log("👤 User ID from middleware:", req.userId);

    // Get provider profile to check location and categories
    const provider = await req.prisma.user.findUnique({
      where: { id: providerId },
      include: {
        provider: {
          include: {
            categories: {
              include: {
                category: true,
              },
            },
          },
        },
      },
    });

    if (!provider || !provider.provider) {
      console.log("❌ Provider profile not found");
      return res.status(404).json({ error: "Provider profile not found" });
    }

    // Get provider's service categories
    const providerCategoryIds = provider.provider.categories.map(
      (pc) => pc.categoryId
    );
    console.log(`📂 Provider categories: ${providerCategoryIds.join(", ")}`);

    if (providerCategoryIds.length === 0) {
      console.log("❌ No categories configured for provider");
      return res.json([]); // No categories, no jobs
    }

    // Get available jobs within radius (both QUICK_BOOK and POST_QUOTE)
    const jobs = await req.prisma.job.findMany({
      where: {
        AND: [
          {
            status: "BROADCASTED", // Only broadcasted jobs
          },
          {
            categoryId: {
              in: providerCategoryIds, // Only jobs in provider's categories
            },
          },
          {
            customerId: {
              not: providerId, // Provider can't accept their own jobs
            },
          },
          {
            OR: [
              // QUICK_BOOK jobs that haven't been accepted yet
              {
                AND: [{ type: "QUICK_BOOK" }, { providerId: null }],
              },
              // POST_QUOTE jobs that are still accepting bids
              {
                AND: [
                  { type: "POST_QUOTE" },
                  {
                    OR: [
                      { biddingEndsAt: null }, // No bidding deadline
                      { biddingEndsAt: { gt: new Date() } }, // Bidding still open
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            icon: true,
          },
        },
        bids: {
          where: {
            providerId: providerId,
          },
          select: {
            id: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    console.log(`📋 Found ${jobs.length} total jobs`);

    // Filter out POST_QUOTE jobs where provider already has a pending bid
    const availableJobs = jobs.filter((job) => {
      if (job.type === "POST_QUOTE") {
        // Check if provider already bid on this job
        const existingBid = job.bids.find((bid) => bid.status === "PENDING");
        if (existingBid) {
          console.log(
            `⏭️  Skipping job ${job.id} - provider already has pending bid`
          );
          return false;
        }
      }
      return true; // QUICK_BOOK jobs are always available if not taken
    });

    console.log(`✅ Returning ${availableJobs.length} available jobs`);

    // Calculate distance and format response
    const formattedJobs = availableJobs.map((job) => {
      // Calculate distance (simplified - in real app use proper geolocation)
      const distance = Math.round(Math.random() * 15) + 1; // 1-15km for demo

      // Calculate deadline for quick book jobs
      let quickBookDeadline = null;
      if (job.type === "QUICK_BOOK" && job.arrivalWindow) {
        const deadline = new Date(job.createdAt);
        deadline.setHours(deadline.getHours() + job.arrivalWindow);
        quickBookDeadline = deadline.toISOString();
      }

      return {
        id: job.id,
        title: job.title,
        description: job.description,
        type: job.type,
        status: job.status,
        estimatedPrice: job.estimatedPrice,
        acceptPrice: job.acceptPrice,
        arrivalWindow: job.arrivalWindow,
        distance: distance,
        createdAt: job.createdAt,
        biddingEndsAt: job.biddingEndsAt,
        quickBookDeadline,
        category: job.category,
        customer: job.customer,
        address: job.address,
        latitude: job.latitude,
        longitude: job.longitude,
      };
    });

    // Log what we're returning
    const quickBookJobs = formattedJobs.filter(
      (j) => j.type === "QUICK_BOOK"
    ).length;
    const postQuoteJobs = formattedJobs.filter(
      (j) => j.type === "POST_QUOTE"
    ).length;
    console.log(
      `📊 Returning: ${quickBookJobs} Quick Book, ${postQuoteJobs} Post Quote jobs`
    );

    // Split jobs into two groups
    const available = [];
    const alreadyBidJobs = [];

    for (const job of jobs) {
      const hasPendingBid = job.bids.some((bid) => bid.status === "PENDING");

      // Calculate distance (fake for demo)
      const distance = Math.round(Math.random() * 15) + 1;

      // QuickBook deadline
      let quickBookDeadline = null;
      if (job.type === "QUICK_BOOK" && job.arrivalWindow) {
        const deadline = new Date(job.createdAt);
        deadline.setHours(deadline.getHours() + job.arrivalWindow);
        quickBookDeadline = deadline.toISOString();
      }

      const formattedJob = {
        id: job.id,
        title: job.title,
        description: job.description,
        type: job.type,
        status: job.status,
        estimatedPrice: job.estimatedPrice,
        acceptPrice: job.acceptPrice,
        arrivalWindow: job.arrivalWindow,
        distance,
        createdAt: job.createdAt,
        biddingEndsAt: job.biddingEndsAt,
        quickBookDeadline,
        category: job.category,
        customer: job.customer,
        address: job.address,
        latitude: job.latitude,
        longitude: job.longitude,
        hasUserBid: hasPendingBid,
        bidId: hasPendingBid
          ? job.bids.find((b) => b.status === "PENDING")?.id
          : null,
      };

      if (job.type === "POST_QUOTE" && hasPendingBid) {
        alreadyBidJobs.push(formattedJob);
      } else {
        available.push(formattedJob);
      }
    }

    console.log(
      `📊 Returning: ${available.length} available, ${alreadyBidJobs.length} already bid`
    );

    // Send both groups
    res.json({
      available: available,
      alreadyBid: alreadyBidJobs,
    });
  } catch (error) {
    console.error("❌ Error getting available jobs:", error);
    res.status(500).json({ error: "Failed to get available jobs" });
  }
});

// Get price guidance for a category
router.get("/price-guidance/:categoryId", async (req, res) => {
  const { categoryId } = req.params;

  try {
    const jobService = new JobService(req.prisma, req.app.get("wsService"));
    const guidance = await jobService.getPriceGuidance(categoryId);
    res.json(guidance);
  } catch (error) {
    console.error("Error getting price guidance:", error);
    res.status(500).json({ error: "Failed to get price guidance" });
  }
});

// Create quick book job
router.post(
  "/quick-book",
  requireAuth,
  validateBody(CreateQuickBookJobSchema),
  async (req, res) => {
    try {
      const jobService = new JobService(req.prisma, req.app.get("wsService"));
      const job = await jobService.createQuickBookJob(req.userId, req.body);
      res.status(201).json(job);
    } catch (error) {
      console.error("Error creating quick book job:", error);
      res.status(500).json({ error: "Failed to create job" });
    }
  }
);

// Create post & quote job
router.post(
  "/post-quote",
  requireAuth,
  validateBody(CreatePostQuoteJobSchema),
  async (req, res) => {
    try {
      const jobService = new JobService(req.prisma, req.app.get("wsService"));
      const job = await jobService.createPostQuoteJob(req.userId, req.body);
      res.status(201).json(job);
    } catch (error) {
      console.error("Error creating post quote job:", error);
      res.status(500).json({ error: "Failed to create job" });
    }
  }
);

// Provider accepts quick book job
// Update your accept route in jobs.js to handle the new error properly:

router.post(
  "/accept",
  requireAuth,
  validateBody(AcceptJobSchema),
  async (req, res) => {
    try {
      const wsService = req.app.get("wsService");
      const jobService = new JobService(req.prisma, wsService);
      const { jobId } = req.body;

      const result = await jobService.acceptQuickBookJob(jobId, req.userId);

      // ✅ Broadcast to other providers that job has been taken
      if (result?.job?.id && result?.job?.status === "BOOKED") {
        wsService.broadcast(
          "provider",
          {
            type: "job_taken",
            jobId: result.job.id,
            jobTitle: result.job.title,
            providerName: result.provider?.name || "A provider",
          },
          [req.userId]
        );
      }

      res.json(result);
    } catch (error) {
      console.error("Error accepting job:", error);

      // 🚨 NEW: Handle single job limitation error
      if (
        error.message ===
        "You already have an active job. Complete it before accepting another."
      ) {
        return res.status(400).json({ error: error.message });
      }

      if (
        error.message === "Job already taken" ||
        error.message === "Job is no longer available"
      ) {
        return res.status(409).json({ error: "Job already taken" });
      }

      res.status(500).json({ error: "Failed to accept job" });
    }
  }
);

// Get jobs for customer
router.get("/customer", requireAuth, async (req, res) => {
  const customerId = req.userId;

  try {
    const jobs = await req.prisma.job.findMany({
      where: { customerId },
      include: {
        category: true,
        provider: true,
        bids: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(jobs);
  } catch (error) {
    console.error("Error fetching customer jobs:", error);
    res.status(500).json({ error: "Failed to fetch customer jobs" });
  }
});

// Get jobs for provider
router.get("/provider", requireAuth, async (req, res) => {
  const providerId = req.userId;

  try {
    const jobs = await req.prisma.job.findMany({
      where: { providerId: providerId },
      include: {
        category: true, // ✅ MAKE SURE THIS IS INCLUDED
        customer: true,
        escrow: true,
        bids: {
          where: { providerId: providerId },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(jobs);
  } catch (error) {
    console.error("Error getting provider jobs:", error);
    res.status(500).json({ error: "Failed to get jobs" });
  }
});

// Get job details
router.get("/:jobId", async (req, res) => {
  const { jobId } = req.params;

  try {
    const jobService = new JobService(req.prisma, req.app.get("wsService"));
    const job = await jobService.getJobById(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json(job);
  } catch (error) {
    console.error("Error getting job:", error);
    res.status(500).json({ error: "Failed to get job" });
  }
});

// Cancel job
router.post("/:jobId/cancel", requireAuth, async (req, res) => {
  const { jobId } = req.params;

  try {
    const jobService = new JobService(req.prisma, req.app.get("wsService"));
    await jobService.cancelJob(jobId, req.userId); // assume it succeeds
    res.json({ success: true });
  } catch (error) {
    console.error("Error canceling job:", error);
    res.status(500).json({ error: "Failed to cancel job" });
  }
});

router.post("/:jobId/complete", requireAuth, async (req, res) => {
  const { jobId } = req.params;

  try {
    const jobService = new JobService(req.prisma, req.app.get("wsService"));
    const result = await jobService.completeJob(jobId, req.userId);
    res.json({
      success: true,
      job: result,
      message: "Job completed successfully",
    });
  } catch (error) {
    console.error("Error completing job:", error);
    res.status(500).json({ error: error.message || "Failed to complete job" });
  }
});

export { router as jobRoutes };
