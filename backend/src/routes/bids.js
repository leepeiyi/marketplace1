// routes/bids.js
import { Router } from "express";
import { z } from "zod";
import { writeLimiter } from "../middleware/rateLimit.js";

const router = Router();

// Authentication middleware
const requireAuth = (req, res, next) => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    return res.status(401).json({ error: "User ID required" });
  }
  req.userId = userId;
  next();
};

const CreateBidSchema = z.object({
  jobId: z.string(),
  price: z.number().positive(),
  note: z.string().optional(),
  estimatedEta: z.number().min(15).max(480), // 15 minutes to 8 hours
});

// Create bid
router.post("/", writeLimiter, async (req, res) => {
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
    // **ENHANCED: Use transaction for atomic check-and-create**
    const result = await req.prisma.$transaction(async (prisma) => {
      // Check if provider already bid on this job (within transaction)
      const existingBid = await prisma.bid.findUnique({
        where: {
          jobId_providerId: {
            jobId: req.body.jobId,
            providerId: providerId,
          },
        },
      });

      if (existingBid) {
        throw new Error("ALREADY_BID");
      }

      // Check if job is still accepting bids
      const job = await prisma.job.findUnique({
        where: { id: req.body.jobId },
        include: {
          customer: true,
        },
      });

      if (!job || job.status !== "BROADCASTED") {
        throw new Error("JOB_NOT_AVAILABLE");
      }

      // Create the bid (within transaction)
      const bid = await prisma.bid.create({
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

      return { bid, job };
    });

    const { bid, job } = result;

    // Check for auto-hire - FIXED VERSION
    let wasAutoHired = false;

    // Check if job has auto-accept price and this bid qualifies
    if (job.acceptPrice && bid.price <= job.acceptPrice) {
      try {
        // Auto-accept this bid
        await req.prisma.$transaction(async (prisma) => {
          // Update job status - FIXED VERSION
          await prisma.job.update({
            where: { id: job.id },
            data: {
              status: "BOOKED",
              // Use provider relation instead of providerId
              provider: {
                connect: { id: bid.providerId },
              },
              updatedAt: new Date(),
            },
          });

          // Update bid status - FIXED VERSION
          await prisma.bid.update({
            where: { id: bid.id },
            data: {
              status: "ACCEPTED",
              updatedAt: new Date(),
            },
          });

          // Create escrow - FIXED VERSION
          await prisma.escrow.create({
            data: {
              jobId: job.id,
              amount: bid.price,
            },
          });

          // Reject other bids
          await prisma.bid.updateMany({
            where: {
              jobId: job.id,
              id: { not: bid.id },
            },
            data: { status: "REJECTED" },
          });
        });

        wasAutoHired = true;

        // Notify provider of auto-acceptance
        const wsService = req.app.get("wsService");
        if (wsService) {
          try {
            wsService.notifyProvider(bid.providerId, {
              type: "bid_accepted",
              job: {
                id: job.id,
                title: job.title,
                address: job.address,
                customerName: job.customer.name,
                price: bid.price,
              },
              message: "Your bid was automatically accepted!",
            });

            // Notify customer
            wsService.notifyCustomer(job.customerId, {
              type: "job_accepted",
              job: {
                id: job.id,
                title: job.title,
                providerName: bid.provider.provider.name,
                price: bid.price,
              },
              message: "Your job was automatically assigned!",
            });
          } catch (wsError) {
            console.error("WebSocket notification error:", wsError);
            // Continue execution even if notifications fail
          }
        }
      } catch (error) {
        console.error("Error in auto-hire:", error);
        // Continue without auto-hire if there's an error
      }
    }

    if (!wasAutoHired) {
      // Notify customer of new bid (only if not auto-hired)
      const wsService = req.app.get("wsService");
      if (wsService) {
        try {
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
        } catch (wsError) {
          console.error("WebSocket notification error:", wsError);
          // Continue execution even if notifications fail
        }
      }
    }

    res.status(201).json({
      ...bid,
      autoHired: wasAutoHired,
    });
  } catch (error) {
    console.error("Error creating bid:", error);

    // **ENHANCED: Handle specific error types**
    if (error.message === "ALREADY_BID") {
      return res.status(409).json({ error: "already bid" });
    }

    if (error.message === "JOB_NOT_AVAILABLE") {
      return res.status(400).json({ error: "Job is no longer accepting bids" });
    }

    // Handle Prisma unique constraint violations
    if (error.code === "P2002" && error.meta?.target?.includes("jobId")) {
      return res.status(409).json({ error: "already bid" });
    }

    res.status(500).json({ error: "Failed to create bid" });
  }
});

// Enhanced get bids route with ranking
router.get("/job/:jobId", async (req, res) => {
  const { jobId } = req.params;
  const { ranked } = req.query; // ?ranked=true for ranked bids

  try {
    if (ranked === "true") {
      // Return ranked bids for customer - simplified version
      const bids = await req.prisma.bid.findMany({
        where: {
          jobId: jobId,
          status: { in: ["PENDING", "ACCEPTED"] },
        },
        include: {
          provider: {
            include: {
              provider: true,
            },
          },
        },
        orderBy: [
          { price: "asc" }, // Sort by price first
          { provider: { provider: { averageRating: "desc" } } }, // Then by rating
          { createdAt: "asc" }, // Then by time
        ],
      });
      res.json(bids);
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

// Get ranked bids for a job (for customer bid tracking)
// Define the weights
const WEIGHTS = {
  price: 0.4,
  rating: 0.3,
  eta: 0.2,
  reliability: 0.1, // optional if you want to use it
};

router.get("/:jobId/ranked-bids", requireAuth, async (req, res) => {
  const { jobId } = req.params;

  try {
    const bids = await req.prisma.bid.findMany({
      where: {
        jobId,
        status: { in: ["PENDING", "ACCEPTED"] },
      },
      include: {
        provider: {
          include: {
            provider: true,
          },
        },
      },
    });

    // Normalization helpers
    const minPrice = Math.min(...bids.map((b) => b.price));
    const maxPrice = Math.max(...bids.map((b) => b.price));
    const minEta = Math.min(...bids.map((b) => b.estimatedEta));
    const maxEta = Math.max(...bids.map((b) => b.estimatedEta));

    const normalize = (val, min, max) =>
      max === min ? 1 : (val - min) / (max - min);

    const rankedBids = bids.map((bid) => {
      const provider = bid.provider?.provider;

      const normPrice = 1 - normalize(bid.price, minPrice, maxPrice); // lower price = higher score
      const normRating = (provider?.averageRating || 0) / 5; // already 0–1
      const normEta = 1 - normalize(bid.estimatedEta, minEta, maxEta); // lower ETA = higher score
      const normReliability = (provider?.reliabilityScore || 100) / 100;

      const score =
        normPrice * WEIGHTS.price +
        normRating * WEIGHTS.rating +
        normEta * WEIGHTS.eta +
        normReliability * WEIGHTS.reliability;

      return {
        ...bid,
        rank_score: Math.round(score * 100) / 100, // round to 2dp
      };
    });

    // Sort by score descending
    rankedBids.sort((a, b) => b.rank_score - a.rank_score);

    res.json(rankedBids);
  } catch (error) {
    console.error("❌ Error computing ranked bids:", error);
    res.status(500).json({ error: "Failed to compute bid rankings" });
  }
});

router.post("/:bidId/accept", requireAuth, async (req, res) => {
  const { bidId } = req.params;
  const customerId = req.userId;

  try {
    // **ENHANCED: Use transaction for atomic operations**
    const result = await req.prisma.$transaction(async (prisma) => {
      // Get the bid with job and provider details within transaction
      const bid = await prisma.bid.findUnique({
        where: { id: bidId },
        include: {
          job: {
            include: {
              customer: true,
            },
          },
          provider: {
            include: {
              provider: true,
            },
          },
        },
      });

      if (!bid) {
        throw new Error("BID_NOT_FOUND");
      }

      // Verify the customer owns this job
      if (bid.job.customerId !== customerId) {
        throw new Error("UNAUTHORIZED");
      }

      // Check if job is still accepting bids
      if (bid.job.status !== "BROADCASTED") {
        throw new Error("JOB_NO_LONGER_ACCEPTING_BIDS");
      }

      // Check if bid is still pending
      if (bid.status !== "PENDING") {
        throw new Error("BID_ALREADY_PROCESSED");
      }

      // **ATOMIC UPDATES: Use updateMany with conditions to prevent race conditions**

      // 1. Update the job status to BOOKED
      const jobUpdateResult = await prisma.job.updateMany({
        where: {
          id: bid.jobId,
          status: "BROADCASTED", // Only update if still broadcasted
        },
        data: {
          status: "BOOKED",
          providerId: bid.providerId,
          updatedAt: new Date(),
        },
      });

      if (jobUpdateResult.count === 0) {
        throw new Error("JOB_ALREADY_PROCESSED");
      }

      // 2. Update the accepted bid status
      const bidUpdateResult = await prisma.bid.updateMany({
        where: {
          id: bidId,
          status: "PENDING", // Only update if still pending
        },
        data: {
          status: "ACCEPTED",
          updatedAt: new Date(),
        },
      });

      if (bidUpdateResult.count === 0) {
        throw new Error("BID_ALREADY_PROCESSED");
      }

      // 3. Create escrow record
      const escrow = await prisma.escrow.create({
        data: {
          jobId: bid.jobId,
          amount: bid.price,
          status: "HELD",
        },
      });

      // 4. Reject all other bids for this job
      await prisma.bid.updateMany({
        where: {
          jobId: bid.jobId,
          id: {
            not: bidId,
          },
        },
        data: {
          status: "REJECTED",
        },
      });

      // Get the final state
      const updatedJob = await prisma.job.findUnique({
        where: { id: bid.jobId },
      });

      const updatedBid = await prisma.bid.findUnique({
        where: { id: bidId },
      });

      return {
        job: updatedJob,
        bid: updatedBid,
        escrow,
        originalBid: bid, // Keep original for notifications
      };
    });

    // Send notifications outside of transaction
    const wsService = req.app.get("wsService");
    if (wsService) {
      try {
        // Notify the accepted provider
        wsService.notifyProvider(result.originalBid.providerId, {
          type: "bid_accepted",
          job: {
            id: result.originalBid.job.id,
            title: result.originalBid.job.title,
            address: result.originalBid.job.address,
            customerName: result.originalBid.job.customer.name,
            customerPhone: result.originalBid.job.customer.phone,
            price: result.originalBid.price,
          },
          message:
            "Your bid has been accepted! Contact the customer to arrange service.",
        });

        // Notify rejected providers
        const rejectedBids = await req.prisma.bid.findMany({
          where: {
            jobId: result.originalBid.jobId,
            id: { not: bidId },
            status: "REJECTED",
          },
          include: {
            provider: true,
          },
        });

        rejectedBids.forEach((rejectedBid) => {
          wsService.notifyProvider(rejectedBid.providerId, {
            type: "bid_rejected",
            jobId: result.originalBid.jobId,
            message: "The customer selected another provider for this job.",
          });
        });
      } catch (wsError) {
        console.error("WebSocket notification error:", wsError);
        // Continue execution even if notifications fail
      }
    }

    res.json({
      success: true,
      job: result.job,
      bid: result.bid,
      escrow: result.escrow,
      message: "Bid accepted successfully",
      redirect: {
        url: "/dashboard",
        message: `Great! You've hired ${result.originalBid.provider.provider.name} for $${result.originalBid.price}. They'll contact you soon!`,
        type: "success",
      },
    });
  } catch (error) {
    console.error("Error accepting bid:", error);

    // **ENHANCED: Handle specific error types**
    if (error.message === "BID_NOT_FOUND") {
      return res.status(404).json({ error: "Bid not found" });
    }

    if (error.message === "UNAUTHORIZED") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (error.message === "JOB_NO_LONGER_ACCEPTING_BIDS") {
      return res.status(400).json({ error: "Job is no longer accepting bids" });
    }

    if (
      error.message === "BID_ALREADY_PROCESSED" ||
      error.message === "JOB_ALREADY_PROCESSED"
    ) {
      return res.status(409).json({ error: "Bid has already been processed" });
    }

    res.status(500).json({ error: "Failed to accept bid" });
  }
});

// Get bid details
router.get("/:bidId", requireAuth, async (req, res) => {
  const { bidId } = req.params;
  const userId = req.userId;

  try {
    const bid = await req.prisma.bid.findUnique({
      where: { id: bidId },
      include: {
        provider: {
          include: {
            provider: true,
          },
        },
        job: {
          include: {
            customer: true,
            category: true,
          },
        },
      },
    });

    if (!bid) {
      return res.status(404).json({ error: "Bid not found" });
    }

    // Check if user has permission to view this bid
    const isCustomer = bid.job.customerId === userId;
    const isProvider = bid.providerId === userId;

    if (!isCustomer && !isProvider) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    res.json(bid);
  } catch (error) {
    console.error("Error getting bid:", error);
    res.status(500).json({ error: "Failed to get bid" });
  }
});

// Update bid (provider can update their own bid before it's accepted)
router.put("/:bidId", writeLimiter, requireAuth, async (req, res) => {
  const { bidId } = req.params;
  const providerId = req.userId;
  const { price, note, estimatedEta } = req.body;

  try {
    // **ENHANCED: Use transaction for atomic check-and-update**
    const result = await req.prisma.$transaction(async (prisma) => {
      // Get current bid state within transaction
      const bid = await prisma.bid.findUnique({
        where: { id: bidId },
        include: {
          job: true,
        },
      });

      if (!bid) {
        throw new Error("BID_NOT_FOUND");
      }

      // Check if provider owns this bid
      if (bid.providerId !== providerId) {
        throw new Error("UNAUTHORIZED");
      }

      // **CRITICAL: Check if bid can still be updated within transaction**
      if (bid.status !== "PENDING") {
        throw new Error("BID_ALREADY_PROCESSED");
      }

      if (bid.job.status !== "BROADCASTED") {
        throw new Error("JOB_NO_LONGER_ACCEPTING_BIDS");
      }

      // **ATOMIC UPDATE: Only update if still in PENDING state**
      const updateResult = await prisma.bid.updateMany({
        where: {
          id: bidId,
          status: "PENDING", // Only update if still pending
          providerId: providerId, // Double-check ownership
        },
        data: {
          ...(price && { price }),
          ...(note && { note }),
          ...(estimatedEta && { estimatedEta }),
          updatedAt: new Date(),
        },
      });

      // Check if the update actually affected any rows
      if (updateResult.count === 0) {
        throw new Error("BID_ALREADY_PROCESSED");
      }

      // Get the updated bid
      const updatedBid = await prisma.bid.findUnique({
        where: { id: bidId },
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

      return updatedBid;
    });

    // Send notification outside of transaction
    const wsService = req.app.get("wsService");
    if (wsService) {
      try {
        wsService.notifyCustomer(result.job.customerId, {
          type: "bid_updated",
          bid: {
            id: result.id,
            price: result.price,
            providerName: result.provider.provider.name,
            estimatedEta: result.estimatedEta,
            note: result.note,
          },
          message: `${result.provider.provider.name} updated their bid`,
        });
      } catch (wsError) {
        console.error("WebSocket notification error:", wsError);
        // Continue even if notification fails
      }
    }

    res.json(result);
  } catch (error) {
    console.error("Error updating bid:", error);

    // **ENHANCED: Handle specific error types**
    if (error.message === "BID_NOT_FOUND") {
      return res.status(404).json({ error: "Bid not found" });
    }

    if (error.message === "UNAUTHORIZED") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (error.message === "BID_ALREADY_PROCESSED") {
      return res.status(400).json({ error: "Bid can no longer be updated" });
    }

    if (error.message === "JOB_NO_LONGER_ACCEPTING_BIDS") {
      return res.status(400).json({ error: "Job is no longer accepting bids" });
    }

    res.status(500).json({ error: "Failed to update bid" });
  }
});

// Delete/withdraw bid (provider can withdraw their bid before it's accepted)
router.delete("/:bidId", writeLimiter, requireAuth, async (req, res) => {
  const { bidId } = req.params;
  const providerId = req.userId;

  try {
    const bid = await req.prisma.bid.findUnique({
      where: { id: bidId },
      include: {
        job: true,
      },
    });

    if (!bid) {
      return res.status(404).json({ error: "Bid not found" });
    }

    // Check if provider owns this bid
    if (bid.providerId !== providerId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Check if bid can be withdrawn
    if (bid.status !== "PENDING" || bid.job.status !== "BROADCASTED") {
      return res.status(400).json({ error: "Bid can no longer be withdrawn" });
    }

    // Delete the bid
    await req.prisma.bid.delete({
      where: { id: bidId },
    });

    // Notify customer of bid withdrawal
    const wsService = req.app.get("wsService");
    if (wsService) {
      wsService.notifyCustomer(bid.job.customerId, {
        type: "bid_withdrawn",
        jobId: bid.jobId,
        message: "A provider withdrew their bid",
      });
    }

    res.json({ success: true, message: "Bid withdrawn successfully" });
  } catch (error) {
    console.error("Error withdrawing bid:", error);
    res.status(500).json({ error: "Failed to withdraw bid" });
  }
});

export { router as bidRoutes };
