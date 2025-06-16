// routes/bids.js
import { Router } from "express";
import { z } from "zod";

const router = Router();

const CreateBidSchema = z.object({
  jobId: z.string(),
  price: z.number().positive(),
  note: z.string().optional(),
  estimatedEta: z.number().min(15).max(480), // 15 minutes to 8 hours
});

// Create bid
router.post("/", async (req, res) => {
  try {
    CreateBidSchema.parse(req.body);
  } catch (error) {
    return res
      .status(400)
      .json({ error: "Invalid request body", details: error.errors });
  }

  const providerId = req.headers["x-user-id"];
  if (!providerId) {
    return res.status(401).json({ error: "User ID required" });
  }

  try {
    // Check if provider already bid on this job
    const existingBid = await req.prisma.bid.findUnique({
      where: {
        jobId_providerId: {
          jobId: req.body.jobId,
          providerId: providerId,
        },
      },
    });

    if (existingBid) {
      return res.status(409).json({ error: "already bid" });
    }

    // Check if job is still accepting bids
    const job = await req.prisma.job.findUnique({
      where: { id: req.body.jobId },
    });

    if (!job || job.status !== "BROADCASTED") {
      return res.status(400).json({ error: "Job is no longer accepting bids" });
    }

    // Create the bid
    const bid = await req.prisma.bid.create({
      data: {
        ...req.body,
        providerId,
      },
      include: {
        provider: {
          include: {
            provider: true,
          },
        },
        job: {
          include: {
            customer: true,
          },
        },
      },
    });

    // Check for auto-hire
    const jobService = new JobService(req.prisma, req.app.get("wsService"));
    const wasAutoHired = await jobService.checkAutoHire(bid);

    if (!wasAutoHired) {
      // Notify customer of new bid (only if not auto-hired)
      const wsService = req.app.get("wsService");
      wsService.notifyCustomer(bid.job.customerId, {
        type: "bid_received",
        bid: {
          id: bid.id,
          price: bid.price,
          providerName: bid.provider.provider.name,
          providerRating: bid.provider.provider.averageRating,
          estimatedEta: bid.estimatedEta,
          note: bid.note,
        },
      });
    }

    res.status(201).json({
      ...bid,
      autoHired: wasAutoHired,
    });
  } catch (error) {
    console.error("Error creating bid:", error);
    res.status(500).json({ error: "Failed to create bid" });
  }
});

// Enhanced get bids route with ranking
router.get("/job/:jobId", async (req, res) => {
  const { jobId } = req.params;
  const { ranked } = req.query; // ?ranked=true for ranked bids

  try {
    if (ranked === "true") {
      // Return ranked bids for customer
      const jobService = new JobService(req.prisma, req.app.get("wsService"));
      const rankedBids = await jobService.getRankedBids(jobId);
      res.json(rankedBids);
    } else {
      // Return all bids (for admin/debugging)
      const bids = await req.prisma.bid.findMany({
        where: { jobId },
        include: {
          provider: {
            include: {
              provider: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      res.json(bids);
    }
  } catch (error) {
    console.error("Error getting bids:", error);
    res.status(500).json({ error: "Failed to get bids" });
  }
});

export { router as bidRoutes };
