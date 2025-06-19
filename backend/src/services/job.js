// services/job.js
import { WebSocketServer } from "ws";

class JobService {
  constructor(prisma, wsService) {
    this.prisma = prisma;
    this.wsService = wsService;
  }

  async getPriceGuidance(categoryId) {
    try {
      // Get historical job data for this category
      const completedJobs = await this.prisma.job.findMany({
        where: {
          categoryId,
          status: "COMPLETED",
          finalPrice: { not: null },
        },
        select: {
          finalPrice: true,
        },
      });

      if (completedJobs.length === 0) {
        // Default pricing if no historical data
        return {
          p10: 50,
          p50: 100,
          p90: 200,
          dataPoints: 0,
        };
      }

      const prices = completedJobs
        .map((job) => job.finalPrice)
        .sort((a, b) => a - b);
      const count = prices.length;

      return {
        p10: Math.round(prices[Math.floor(count * 0.1)] || prices[0]),
        p50: Math.round(prices[Math.floor(count * 0.5)]),
        p90: Math.round(prices[Math.floor(count * 0.9)] || prices[count - 1]),
        dataPoints: count,
      };
    } catch (error) {
      console.error("Error getting price guidance:", error);
      throw error;
    }
  }

  async createQuickBookJob(customerId, jobData) {
    try {
      // Get price guidance for automatic pricing
      const priceGuidance = await this.getPriceGuidance(jobData.categoryId);
      const estimatedPrice = priceGuidance.p50;

      // Calculate arrival deadline
      const quickBookDeadline = new Date();
      quickBookDeadline.setHours(
        quickBookDeadline.getHours() + jobData.arrivalWindow
      );

      const job = await this.prisma.job.create({
        data: {
          customerId,
          categoryId: jobData.categoryId,
          title: jobData.title,
          description: jobData.description,
          latitude: jobData.latitude,
          longitude: jobData.longitude,
          address: jobData.address,
          type: "QUICK_BOOK",
          status: "BROADCASTED",
          estimatedPrice,
          arrivalWindow: jobData.arrivalWindow,
          quickBookDeadline,
        },
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

      // Notify nearby providers
      await this.notifyNearbyProviders(job);

      return job;
    } catch (error) {
      console.error("Error creating quick book job:", error);
      throw error;
    }
  }

  async notifyNearbyProviders(job) {
    try {
      // Find providers within 5km radius who can handle this category
      const radiusKm = 5;
      const providers = await this.prisma.$queryRaw`
        SELECT DISTINCT u.id, u.name, p.id as "providerId", p.latitude, p.longitude, p."isAvailable"
        FROM users u
        JOIN providers p ON u.id = p."userId"
        JOIN provider_categories pc ON p.id = pc."providerId"
        WHERE pc."categoryId" = ${job.categoryId}
        AND p."isAvailable" = true
        AND p.latitude IS NOT NULL
        AND p.longitude IS NOT NULL
        AND (
          6371 * acos(
            cos(radians(${job.latitude})) * 
            cos(radians(p.latitude)) * 
            cos(radians(p.longitude) - radians(${job.longitude})) + 
            sin(radians(${job.latitude})) * 
            sin(radians(p.latitude))
          )
        ) <= ${radiusKm}
      `;

      console.log(
        `Found ${providers.length} nearby providers for job ${job.id}`
      );

      // Send notifications to each provider
      for (const provider of providers) {
        const distance = this.calculateDistance(
          job.latitude,
          job.longitude,
          provider.latitude,
          provider.longitude
        );

        this.wsService.notifyProvider(provider.id, {
          type: "new_quick_book_job",
          job: {
            id: job.id,
            title: job.title,
            category: job.category.name,
            address: job.address,
            estimatedPrice: job.estimatedPrice,
            distance: Math.round(distance * 10) / 10, // Round to 1 decimal
            quickBookDeadline: job.quickBookDeadline,
            customerName: job.customer.name,
          },
        });
      }

      return providers.length;
    } catch (error) {
      console.error("Error notifying providers:", error);
      throw error;
    }
  }

  // Enhanced section of services/job.js - acceptQuickBookJob method with better concurrency handling

  async acceptQuickBookJob(jobId, providerId) {
    try {
      console.log(
        `🎯 Provider ${providerId} attempting to accept job ${jobId}`
      );

      // **ENHANCED: Use transaction for atomic check-and-update**
      const result = await this.prisma.$transaction(async (prisma) => {
        // Check job availability within transaction
        const job = await prisma.job.findUnique({
          where: { id: jobId },
          include: {
            customer: true,
            category: true,
          },
        });

        if (!job) {
          throw new Error("Job not found");
        }

        if (job.type !== "QUICK_BOOK") {
          throw new Error("Job is not a quick book job");
        }

        if (job.status !== "BROADCASTED") {
          throw new Error("Job is no longer available");
        }

        if (job.providerId) {
          throw new Error("Job already taken");
        }

        if (job.customerId === providerId) {
          throw new Error("Cannot accept your own job");
        }

        // Check if provider exists and is available
        const provider = await prisma.user.findUnique({
          where: { id: providerId },
          include: {
            provider: {
              include: {
                categories: {
                  where: { categoryId: job.categoryId },
                },
              },
            },
          },
        });

        if (!provider || !provider.provider) {
          throw new Error("Provider profile not found");
        }

        if (!provider.provider.isAvailable) {
          throw new Error("Provider is not available");
        }

        if (provider.provider.categories.length === 0) {
          throw new Error("Provider not qualified for this job category");
        }

        // **CRITICAL: Atomic update with WHERE condition to prevent race conditions**
        const updatedJob = await prisma.job.updateMany({
          where: {
            id: jobId,
            status: "BROADCASTED",
            providerId: null, // Only update if still unassigned
          },
          data: {
            status: "BOOKED",
            providerId: providerId,
            updatedAt: new Date(),
          },
        });

        // Check if the update actually affected any rows
        if (updatedJob.count === 0) {
          throw new Error("Job already taken");
        }

        // Get the updated job
        const finalJob = await prisma.job.findUnique({
          where: { id: jobId },
          include: {
            customer: true,
            category: true,
            provider: {
              include: {
                provider: true,
              },
            },
          },
        });

        // Create escrow for the job
        const escrow = await prisma.escrow.create({
          data: {
            jobId: jobId,
            amount: finalJob.estimatedPrice || 0,
            status: "HELD",
          },
        });

        return {
          job: finalJob,
          provider: finalJob.provider,
          escrow,
        };
      });

      console.log(
        `✅ Job ${jobId} successfully accepted by provider ${providerId}`
      );

      // Send notifications outside of transaction
      try {
        if (this.wsService) {
          // Notify customer
          this.wsService.notifyCustomer(result.job.customerId, {
            type: "job_accepted",
            job: {
              id: result.job.id,
              title: result.job.title,
              providerName: result.provider.provider.name,
              providerPhone: result.provider.phone,
              estimatedPrice: result.job.estimatedPrice,
              arrivalWindow: result.job.arrivalWindow,
            },
            message: `Great! ${result.provider.provider.name} will be with you soon!`,
          });

          // Notify provider
          this.wsService.notifyProvider(providerId, {
            type: "job_assigned",
            job: {
              id: result.job.id,
              title: result.job.title,
              address: result.job.address,
              customerName: result.job.customer.name,
              customerPhone: result.job.customer.phone,
              category: result.job.category.name,
            },
            message: "Job assigned! Contact the customer to arrange service.",
          });
        }
      } catch (notificationError) {
        console.error("Notification error:", notificationError);
        // Don't fail the job acceptance if notifications fail
      }

      return {
        success: true,
        job: result.job,
        escrow: result.escrow,
        message: "Job accepted successfully",
      };
    } catch (error) {
      console.error("Error accepting job:", error);
      throw error;
    }
  }

  async createPostQuoteJob(customerId, jobData) {
    try {
      // Calculate bidding deadline (24 hours from now)
      const biddingEndsAt = new Date();
      biddingEndsAt.setHours(biddingEndsAt.getHours() + 24);

      const job = await this.prisma.job.create({
        data: {
          customerId,
          categoryId: jobData.categoryId,
          title: jobData.title,
          description: jobData.description,
          latitude: jobData.latitude,
          longitude: jobData.longitude,
          address: jobData.address,
          type: "POST_QUOTE",
          status: "BROADCASTED",
          acceptPrice: jobData.acceptPrice || null,
          biddingEndsAt,
          broadcastStage: 1,
          lastBroadcastAt: new Date(),
        },
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

      // Start the 3-stage broadcast process
      await this.startBroadcastProcess(job);

      return job;
    } catch (error) {
      console.error("Error creating post quote job:", error);
      throw error;
    }
  }

  async startBroadcastProcess(job) {
    try {
      console.log(`Starting broadcast process for job ${job.id}`);

      // Stage 1: Immediate broadcast to Tier-A providers within 3km
      await this.broadcastToProviders(job, 1, 3, "TIER_A");

      // Schedule Stage 2: After 5 minutes
      setTimeout(async () => {
        try {
          await this.broadcastToProviders(job, 2, 10, "ALL");
          await this.prisma.job.update({
            where: { id: job.id },
            data: {
              broadcastStage: 2,
              lastBroadcastAt: new Date(),
            },
          });
        } catch (error) {
          console.error("Error in Stage 2 broadcast:", error);
        }
      }, 5 * 60 * 1000); // 5 minutes

      // Schedule Stage 3: After 15 minutes
      setTimeout(async () => {
        try {
          await this.broadcastToProviders(job, 3, null, "ALL");
          await this.prisma.job.update({
            where: { id: job.id },
            data: {
              broadcastStage: 3,
              lastBroadcastAt: new Date(),
            },
          });
        } catch (error) {
          console.error("Error in Stage 3 broadcast:", error);
        }
      }, 15 * 60 * 1000); // 15 minutes
    } catch (error) {
      console.error("Error starting broadcast process:", error);
    }
  }

  // Replace your broadcastToProviders method in services/job.js with this fixed version:

  async broadcastToProviders(job, stage, radiusKm, tierFilter) {
    try {
      let providers;

      if (radiusKm) {
        // With radius limit
        if (tierFilter === "TIER_A") {
          // Stage 1: Tier-A providers within radius
          providers = await this.prisma.$queryRaw`
          SELECT DISTINCT u.id, u.name, p.id as "providerId", p.latitude, p.longitude, 
                 p."averageRating", p."completedJobs", p."isAvailable"
          FROM users u
          JOIN providers p ON u.id = p."userId"
          JOIN provider_categories pc ON p.id = pc."providerId"
          WHERE pc."categoryId" = ${job.categoryId}
          AND p."isAvailable" = true
          AND p.latitude IS NOT NULL
          AND p.longitude IS NOT NULL
          AND p."averageRating" >= 4.5 
          AND p."completedJobs" >= 50
          AND (
            6371 * acos(
              cos(radians(${job.latitude})) * 
              cos(radians(p.latitude)) * 
              cos(radians(p.longitude) - radians(${job.longitude})) + 
              sin(radians(${job.latitude})) * 
              sin(radians(p.latitude))
            )
          ) <= ${radiusKm}
        `;
        } else {
          // Stage 2: All providers within radius
          providers = await this.prisma.$queryRaw`
          SELECT DISTINCT u.id, u.name, p.id as "providerId", p.latitude, p.longitude, 
                 p."averageRating", p."completedJobs", p."isAvailable"
          FROM users u
          JOIN providers p ON u.id = p."userId"
          JOIN provider_categories pc ON p.id = pc."providerId"
          WHERE pc."categoryId" = ${job.categoryId}
          AND p."isAvailable" = true
          AND p.latitude IS NOT NULL
          AND p.longitude IS NOT NULL
          AND (
            6371 * acos(
              cos(radians(${job.latitude})) * 
              cos(radians(p.latitude)) * 
              cos(radians(p.longitude) - radians(${job.longitude})) + 
              sin(radians(${job.latitude})) * 
              sin(radians(p.latitude))
            )
          ) <= ${radiusKm}
        `;
        }
      } else {
        // Stage 3: No radius limit - all providers
        providers = await this.prisma.$queryRaw`
        SELECT DISTINCT u.id, u.name, p.id as "providerId", p.latitude, p.longitude, 
               p."averageRating", p."completedJobs", p."isAvailable"
        FROM users u
        JOIN providers p ON u.id = p."userId"
        JOIN provider_categories pc ON p.id = pc."providerId"
        WHERE pc."categoryId" = ${job.categoryId}
        AND p."isAvailable" = true
      `;
      }

      console.log(
        `Stage ${stage}: Found ${providers.length} providers for job ${
          job.id
        } (tier: ${tierFilter}, radius: ${radiusKm || "unlimited"}km)`
      );

      // Send notifications to each provider
      for (const provider of providers) {
        let distance = null;
        if (radiusKm && provider.latitude && provider.longitude) {
          distance = this.calculateDistance(
            job.latitude,
            job.longitude,
            provider.latitude,
            provider.longitude
          );
        }

        this.wsService.notifyProvider(provider.id, {
          type: "new_post_quote_job",
          job: {
            id: job.id,
            title: job.title,
            category: job.category.name,
            address: job.address,
            acceptPrice: job.acceptPrice,
            distance: distance ? Math.round(distance * 10) / 10 : null,
            biddingEndsAt: job.biddingEndsAt,
            customerName: job.customer.name,
            stage: stage,
            description: job.description,
          },
        });
      }

      return providers.length;
    } catch (error) {
      console.error(`Error broadcasting stage ${stage}:`, error);
      throw error;
    }
  }

  async getCustomerJobs(customerId) {
    return await this.prisma.job.findMany({
      where: { customerId },
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
  }

  async getProviderJobs(providerId) {
    return await this.prisma.job.findMany({
      where: { providerId },
      include: {
        category: true,
        customer: true,
        escrow: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getAvailableJobsForProvider(providerId) {
    // Get provider's location and categories
    const provider = await this.prisma.provider.findUnique({
      where: { userId: providerId },
      include: {
        categories: {
          include: {
            category: true,
          },
        },
      },
    });

    if (
      !provider ||
      !provider.isAvailable ||
      !provider.latitude ||
      !provider.longitude
    ) {
      return [];
    }

    const categoryIds = provider.categories.map((pc) => pc.categoryId);

    // Find available jobs within radius
    const jobs = await this.prisma.job.findMany({
      where: {
        status: "PENDING",
        type: "QUICK_BOOK",
        categoryId: { in: categoryIds },
      },
      include: {
        category: true,
        customer: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Filter by distance and add distance info
    const nearbyJobs = jobs
      .map((job) => ({
        ...job,
        distance: this.calculateDistance(
          provider.latitude,
          provider.longitude,
          job.latitude,
          job.longitude
        ),
      }))
      .filter((job) => job.distance <= 5) // 5km radius
      .sort((a, b) => a.distance - b.distance);

    return nearbyJobs;
  }

  async getJobById(jobId) {
    return await this.prisma.job.findUnique({
      where: { id: jobId },
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
  }

  async cancelJob(jobId, userId) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { escrow: true },
    });

    if (!job) {
      throw new Error("Job not found");
    }

    if (job.customerId !== userId && job.providerId !== userId) {
      throw new Error("Unauthorized");
    }

    if (job.status === "COMPLETED" || job.status.startsWith("CANCELLED")) {
      throw new Error("Cannot cancel this job");
    }

    // Determine cancellation status based on who is cancelling
    const cancelStatus =
      job.customerId === userId
        ? "CANCELLED_BY_CUSTOMER"
        : "CANCELLED_BY_PROVIDER";

    const updatedJob = await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: cancelStatus,
      },
    });

    // Handle escrow refund if exists
    if (job.escrow && job.escrow.status === "HELD") {
      await this.prisma.escrow.update({
        where: { id: job.escrow.id },
        data: {
          status: "REFUNDED",
        },
      });
    }

    // Notify relevant parties
    if (job.providerId && job.providerId !== userId) {
      this.wsService.notifyProvider(job.providerId, {
        type: "job_cancelled",
        jobId: job.id,
        reason: "Customer cancelled",
      });
    }

    if (job.customerId && job.customerId !== userId) {
      this.wsService.notifyCustomer(job.customerId, {
        type: "job_cancelled",
        jobId: job.id,
        reason: "Provider cancelled",
      });
    }

    return updatedJob;
  }

  // Distance calculation (Haversine formula)
  calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  deg2rad = (deg) => {
    return deg * (Math.PI / 180);
  };
}

export default JobService;
