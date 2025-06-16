// services/job.js
export class JobService {
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
          status: 'COMPLETED',
          finalPrice: { not: null }
        },
        select: {
          finalPrice: true
        }
      });

      if (completedJobs.length === 0) {
        // Default pricing if no historical data
        return {
          p10: 50,
          p50: 100,
          p90: 200,
          dataPoints: 0
        };
      }

      const prices = completedJobs.map(job => job.finalPrice).sort((a, b) => a - b);
      const count = prices.length;

      return {
        p10: Math.round(prices[Math.floor(count * 0.1)] || prices[0]),
        p50: Math.round(prices[Math.floor(count * 0.5)]),
        p90: Math.round(prices[Math.floor(count * 0.9)] || prices[count - 1]),
        dataPoints: count
      };
    } catch (error) {
      console.error('Error getting price guidance:', error);
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
      quickBookDeadline.setHours(quickBookDeadline.getHours() + jobData.arrivalWindow);

      const job = await this.prisma.job.create({
        data: {
          customerId,
          categoryId: jobData.categoryId,
          title: jobData.title,
          description: jobData.description,
          latitude: jobData.latitude,
          longitude: jobData.longitude,
          address: jobData.address,
          type: 'QUICK_BOOK',
          status: 'PENDING',
          estimatedPrice,
          arrivalWindow: jobData.arrivalWindow,
          quickBookDeadline
        },
        include: {
          category: true,
          customer: {
            select: {
              name: true,
              phone: true
            }
          }
        }
      });

      // Notify nearby providers
      await this.notifyNearbyProviders(job);

      return job;
    } catch (error) {
      console.error('Error creating quick book job:', error);
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

      console.log(`Found ${providers.length} nearby providers for job ${job.id}`);

      // Send notifications to each provider
      for (const provider of providers) {
        const distance = this.calculateDistance(
          job.latitude, job.longitude,
          provider.latitude, provider.longitude
        );

        this.wsService.notifyProvider(provider.id, {
          type: 'new_quick_book_job',
          job: {
            id: job.id,
            title: job.title,
            category: job.category.name,
            address: job.address,
            estimatedPrice: job.estimatedPrice,
            distance: Math.round(distance * 10) / 10, // Round to 1 decimal
            quickBookDeadline: job.quickBookDeadline,
            customerName: job.customer.name
          }
        });
      }

      return providers.length;
    } catch (error) {
      console.error('Error notifying providers:', error);
      throw error;
    }
  }

  async acceptQuickBookJob(jobId, providerId) {
    try {
      // Check if job is still available
      const job = await this.prisma.job.findUnique({
        where: { id: jobId },
        include: { customer: true }
      });

      if (!job) {
        throw new Error('Job not found');
      }

      if (job.status !== 'PENDING') {
        throw new Error('Job already taken');
      }

      // Update job status and assign provider
      const updatedJob = await this.prisma.job.update({
        where: { id: jobId },
        data: {
          providerId,
          status: 'BOOKED'
        },
        include: {
          provider: true,
          customer: true,
          category: true
        }
      });

      // Create escrow
      await this.prisma.escrow.create({
        data: {
          jobId,
          amount: job.estimatedPrice,
          status: 'HELD'
        }
      });

      // Get provider details
      const provider = await this.prisma.provider.findUnique({
        where: { userId: providerId },
        include: { user: true }
      });

      // Notify customer
      this.wsService.notifyCustomer(job.customerId, {
        type: 'job_accepted',
        job: {
          id: updatedJob.id,
          providerName: provider.user.name,
          providerPhone: provider.user.phone,
          estimatedArrival: updatedJob.quickBookDeadline
        }
      });

      // Notify other providers that job is taken
      const allProviders = await this.prisma.user.findMany({
        where: {
          role: 'PROVIDER'
        }
      });

      for (const otherProvider of allProviders) {
        if (otherProvider.id !== providerId) {
          this.wsService.notifyProvider(otherProvider.id, {
            type: 'job_taken',
            jobId
          });
        }
      }

      return {
        success: true,
        job: updatedJob,
        message: 'Job accepted successfully'
      };
    } catch (error) {
      console.error('Error accepting job:', error);
      throw error;
    }
  }
  

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of Earth in kilometers
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in km
  }

  deg2rad(deg) {
    return deg * (Math.PI/180);
  }

  async getCustomerJobs(customerId) {
    return await this.prisma.job.findMany({
      where: { customerId },
      include: {
        category: true,
        provider: {
          include: {
            provider: true
          }
        },
        escrow: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getProviderJobs(providerId) {
    return await this.prisma.job.findMany({
      where: { providerId },
      include: {
        category: true,
        customer: true,
        escrow: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getAvailableJobsForProvider(providerId) {
    // Get provider's location and categories
    const provider = await this.prisma.provider.findUnique({
      where: { userId: providerId },
      include: {
        categories: {
          include: {
            category: true
          }
        }
      }
    });

    if (!provider || !provider.isAvailable || !provider.latitude || !provider.longitude) {
      return [];
    }

    const categoryIds = provider.categories.map(pc => pc.categoryId);
    
    // Find available jobs within radius
    const jobs = await this.prisma.job.findMany({
      where: {
        status: 'PENDING',
        type: 'QUICK_BOOK',
        categoryId: { in: categoryIds }
      },
      include: {
        category: true,
        customer: {
          select: {
            name: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Filter by distance and add distance info
    const nearbyJobs = jobs
      .map(job => ({
        ...job,
        distance: this.calculateDistance(
          provider.latitude, provider.longitude,
          job.latitude, job.longitude
        )
      }))
      .filter(job => job.distance <= 5) // 5km radius
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
            provider: true
          }
        },
        escrow: true,
        bids: {
          include: {
            provider: {
              include: {
                provider: true
              }
            }
          }
        }
      }
    });
  }

  async cancelJob(jobId, userId) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { escrow: true }
    });

    if (!job) {
      throw new Error('Job not found');
    }

    if (job.customerId !== userId && job.providerId !== userId) {
      throw new Error('Unauthorized');
    }

    if (job.status === 'COMPLETED' || job.status.startsWith('CANCELLED')) {
      throw new Error('Cannot cancel this job');
    }

    // Determine cancellation status based on who is cancelling
    const cancelStatus = job.customerId === userId ? 
      'CANCELLED_BY_CUSTOMER' : 'CANCELLED_BY_PROVIDER';

    const updatedJob = await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: cancelStatus
      }
    });

    // Handle escrow refund if exists
    if (job.escrow && job.escrow.status === 'HELD') {
      await this.prisma.escrow.update({
        where: { id: job.escrow.id },
        data: {
          status: 'REFUNDED'
        }
      });
    }

    // Notify relevant parties
    if (job.providerId && job.providerId !== userId) {
      this.wsService.notifyProvider(job.providerId, {
        type: 'job_cancelled',
        jobId: job.id,
        reason: 'Customer cancelled'
      });
    }

    if (job.customerId && job.customerId !== userId) {
      this.wsService.notifyCustomer(job.customerId, {
        type: 'job_cancelled',
        jobId: job.id,
        reason: 'Provider cancelled'
      });
    }

    return updatedJob;
  }
}