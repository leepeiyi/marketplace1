// routes/bids.js
import { Router } from "express";
import { z } from "zod";

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
      include: {
        customer: true,
      },
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
              // Remove acceptedBidId and bookedAt - not in schema
              updatedAt: new Date(),
            },
          });

          // Update bid status - FIXED VERSION
          await prisma.bid.update({
            where: { id: bid.id },
            data: {
              status: "ACCEPTED",
              // Remove acceptedAt - not in schema
              updatedAt: new Date(),
            },
          });

          // Create escrow - FIXED VERSION
          await prisma.escrow.create({
            data: {
              jobId: job.id,
              amount: bid.price,
              // Remove status - defaults to HELD
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
router.get("/:jobId/ranked-bids", requireAuth, async (req, res) => {
  const { jobId } = req.params;

  try {
    // Get all bids for the job with provider details
    const bids = await req.prisma.bid.findMany({
      where: {
        jobId: jobId,
        // Only show pending bids (not rejected ones)
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
        { price: "asc" }, // Sort by price first (lowest first)
        { provider: { provider: { averageRating: "desc" } } }, // Then by rating
        { createdAt: "asc" }, // Then by time submitted
      ],
    });

    // Format the response to match what the frontend expects
    const formattedBids = bids.map((bid) => ({
      id: bid.id,
      price: bid.price,
      note: bid.note,
      estimatedEta: bid.estimatedEta,
      createdAt: bid.createdAt,
      status: bid.status,
      provider: {
        provider: {
          id: bid.provider.provider.id,
          name: bid.provider.provider.name,
          averageRating: bid.provider.provider.averageRating,
          totalJobs: bid.provider.provider.totalJobs,
          phone: bid.provider.provider.phone,
          yearsExperience: bid.provider.provider.yearsExperience,
          badges: bid.provider.provider.badges || [],
        },
      },
    }));

    res.json(formattedBids);
  } catch (error) {
    console.error("Error getting ranked bids:", error);
    res.status(500).json({ error: "Failed to get bids" });
  }
});

router.post("/:bidId/accept", requireAuth, async (req, res) => {
  const { bidId } = req.params;
  const customerId = req.userId;

  try {
    // Get the bid with job and provider details
    const bid = await req.prisma.bid.findUnique({
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
      return res.status(404).json({ error: "Bid not found" });
    }

    // Verify the customer owns this job
    if (bid.job.customerId !== customerId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Check if job is still accepting bids
    if (bid.job.status !== "BROADCASTED") {
      return res.status(400).json({ error: "Job is no longer accepting bids" });
    }

    // Start a transaction to update multiple records
    const result = await req.prisma.$transaction(async (prisma) => {
      // Update the job status to BOOKED - FIXED VERSION
      const updatedJob = await prisma.job.update({
        where: { id: bid.jobId },
        data: {
          status: "BOOKED",
          // Use provider relation instead of providerId
          provider: {
            connect: { id: bid.providerId },
          },
          // Remove bookedAt - not in schema, use updatedAt instead
          updatedAt: new Date(),
        },
      });

      // Update the accepted bid status
      const updatedBid = await prisma.bid.update({
        where: { id: bidId },
        data: {
          status: "ACCEPTED",
          updatedAt: new Date(),
        },
      });

      // Create escrow record
      const escrow = await prisma.escrow.create({
        data: {
          jobId: bid.jobId,
          amount: bid.price,
          // status defaults to HELD, so no need to specify
        },
      });

      // Reject all other bids for this job
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

      return { job: updatedJob, bid: updatedBid, escrow };
    });

    // Notify the accepted provider
    const wsService = req.app.get("wsService");
    if (wsService) {
      try {
        wsService.notifyProvider(bid.providerId, {
          type: "bid_accepted",
          job: {
            id: bid.job.id,
            title: bid.job.title,
            address: bid.job.address,
            customerName: bid.job.customer.name,
            customerPhone: bid.job.customer.phone,
            price: bid.price,
          },
          message:
            "Your bid has been accepted! Contact the customer to arrange service.",
        });

        // Notify rejected providers
        const rejectedBids = await req.prisma.bid.findMany({
          where: {
            jobId: bid.jobId,
            id: { not: bidId },
          },
          include: {
            provider: true,
          },
        });

        rejectedBids.forEach((rejectedBid) => {
          wsService.notifyProvider(rejectedBid.providerId, {
            type: "bid_rejected",
            jobId: bid.jobId,
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
        message: `Great! You've hired ${bid.provider.provider.name} for $${bid.price}. They'll contact you soon!`,
        type: "success"
      },
    });
  } catch (error) {
    console.error("Error accepting bid:", error);
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
router.put("/:bidId", requireAuth, async (req, res) => {
  const { bidId } = req.params;
  const providerId = req.userId;
  const { price, note, estimatedEta } = req.body;

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

    // Check if bid can still be updated
    if (bid.status !== "PENDING" || bid.job.status !== "BROADCASTED") {
      return res.status(400).json({ error: "Bid can no longer be updated" });
    }

    // Update the bid
    const updatedBid = await req.prisma.bid.update({
      where: { id: bidId },
      data: {
        ...(price && { price }),
        ...(note && { note }),
        ...(estimatedEta && { estimatedEta }),
        updatedAt: new Date(),
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

    // Notify customer of bid update
    const wsService = req.app.get("wsService");
    if (wsService) {
      wsService.notifyCustomer(bid.job.customerId, {
        type: "bid_updated",
        bid: {
          id: updatedBid.id,
          price: updatedBid.price,
          providerName: updatedBid.provider.provider.name,
          estimatedEta: updatedBid.estimatedEta,
          note: updatedBid.note,
        },
        message: `${updatedBid.provider.provider.name} updated their bid`,
      });
    }

    res.json(updatedBid);
  } catch (error) {
    console.error("Error updating bid:", error);
    res.status(500).json({ error: "Failed to update bid" });
  }
});

// Delete/withdraw bid (provider can withdraw their bid before it's accepted)
router.delete("/:bidId", requireAuth, async (req, res) => {
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
