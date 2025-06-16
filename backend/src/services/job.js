import { PrismaClient, JobType, JobStatus } from '@prisma/client';

export class JobService {
  constructor(prisma, wsService) {
    this.prisma = prisma;
    this.wsService = wsService;
  }

  async getPriceGuidance(categoryId) {
    const prices = await this.prisma.priceHistory.findMany({
      where: { categoryId },
      select: { price: true },
      orderBy: { price: 'asc' }
    });

    if (prices.length === 0) {
      return { p10: 50, p50: 100, p90: 200 };
    }

    const sortedPrices = prices.map(p => p.price).sort((a, b) => a - b);
    const p10 = this.getPercentile(sortedPrices, 10);
    const p50 = this.getPercentile(sortedPrices, 50);
    const p90 = this.getPercentile(sortedPrices, 90);

    return { p10, p50, p90 };
  }

  async createQuickBookJob(customerId, data) {
    const guidance = await this.getPriceGuidance(data.categoryId);
    const estimatedPrice = guidance.p50;
    const quickBookDeadline = new Date(Date.now() + 30 * 1000);

    const job = await this.prisma.job.create({
      data: {
        customerId,
        categoryId: data.categoryId,
        title: data.title,
        description: data.description,
        type: 'QUICK_BOOK',
        status: 'PENDING',
        latitude: data.latitude,
        longitude: data.longitude,
        address: data.address,
        estimatedPrice,
        arrivalWindow: data.arrivalWindow,
        quickBookDeadline,
        scheduledAt: new Date(Date.now() + data.arrivalWindow * 60 * 60 * 1000)
      },
      include: {
        category: true,
        customer: true
      }
    });

    return job;
  }

  // Add other methods as needed
  async createPostQuoteJob(customerId, data) {
    // Placeholder implementation
    return { id: 'placeholder' };
  }

  async acceptQuickBookJob(jobId, providerId) {
    // Placeholder implementation
    return { id: 'placeholder' };
  }

  async getCustomerJobs(customerId) {
    return [];
  }

  async getProviderJobs(providerId) {
    return [];
  }

  async getAvailableJobsForProvider(providerId) {
    return [];
  }

  async getJobById(jobId) {
    return null;
  }

  async cancelJob(jobId, userId) {
    return { id: 'placeholder' };
  }

  getPercentile(sortedArray, percentile) {
    const index = (percentile / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;

    if (upper >= sortedArray.length) return sortedArray[sortedArray.length - 1];
    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }
}