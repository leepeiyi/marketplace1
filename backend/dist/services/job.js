"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobService = void 0;
const client_1 = require("@prisma/client");
class JobService {
    constructor(prisma, wsService) {
        this.prisma = prisma;
        this.wsService = wsService;
    }
    async getPriceGuidance(categoryId) {
        const prices = await this.prisma.priceHistory.findMany({
            where: {
                categoryId
            },
            select: { price: true },
            orderBy: { price: 'asc' }
        });
        if (prices.length === 0) {
            return { p10: 50, p50: 100, p90: 200 }; // Default values
        }
        const sortedPrices = prices.map(p => p.price).sort((a, b) => a - b);
        const p10 = this.getPercentile(sortedPrices, 10);
        const p50 = this.getPercentile(sortedPrices, 50);
        const p90 = this.getPercentile(sortedPrices, 90);
        return { p10, p50, p90 };
    }
    async createQuickBookJob(customerId, data) {
        const guidance = await this.getPriceGuidance(data.categoryId);
        const estimatedPrice = guidance.p50; // Use median as estimated price
        const quickBookDeadline = new Date(Date.now() + 30 * 1000); // 30 seconds
        const job = await this.prisma.job.create({
            data: {
                customerId,
                categoryId: data.categoryId,
                title: data.title,
                description: data.description,
                type: client_1.JobType.QUICK_BOOK,
                status: client_1.JobStatus.PENDING,
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
        // Find available providers within 5km
        const availableProviders = await this.findNearbyProviders(data.latitude, data.longitude, 5, // 5km radius for quick book
        data.categoryId);
        // Broadcast to available providers
        if (availableProviders.length > 0) {
            await this.prisma.job.update({
                where: { id: job.id },
                data: { status: client_1.JobStatus.BROADCASTED }
            });
            this.wsService.broadcastJobToProviders(job, availableProviders.map(p => p.userId));
        }
        return job;
    }
    async createPostQuoteJob(customerId, data) {
        const biddingEndsAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        const job = await this.prisma.job.create({
            data: {
                customerId,
                categoryId: data.categoryId,
                title: data.title,
                description: data.description,
                type: client_1.JobType.POST_QUOTE,
                status: client_1.JobStatus.PENDING,
                latitude: data.latitude,
                longitude: data.longitude,
                address: data.address,
                acceptPrice: data.acceptPrice,
                biddingEndsAt,
                broadcastStage: 1,
                lastBroadcastAt: new Date()
            },
            include: {
                category: true,
                customer: true
            }
        });
        // Start stage 1 broadcast (Tier-A providers within 3km)
        await this.broadcastToStage1(job.id);
        return job;
    }
    async acceptQuickBookJob(jobId, providerId) {
        // Use transaction to prevent race conditions
        return await this.prisma.$transaction(async (tx) => {
            const job = await tx.job.findUnique({
                where: { id: jobId },
                include: { category: true }
            });
            if (!job) {
                throw new Error('Job not found');
            }
            if (job.status !== client_1.JobStatus.BROADCASTED) {
                throw new Error('Job already taken');
            }
            if (job.quickBookDeadline && new Date() > job.quickBookDeadline) {
                throw new Error('Job deadline passed');
            }
            // Update job status
            const updatedJob = await tx.job.update({
                where: { id: jobId },
                data: {
                    status: client_1.JobStatus.BOOKED,
                    providerId,
                    finalPrice: job.estimatedPrice
                },
                include: {
                    customer: true,
                    provider: true,
                    category: true
                }
            });
            // Create escrow hold
            await tx.escrow.create({
                data: {
                    jobId,
                    amount: job.estimatedPrice || 0,
                    status: 'HELD'
                }
            });
            return updatedJob;
        });
    }
    async getCustomerJobs(customerId) {
        return await this.prisma.job.findMany({
            where: { customerId },
            include: {
                category: true,
                provider: true,
                bids: {
                    include: {
                        provider: {
                            include: {
                                provider: true
                            }
                        }
                    },
                    orderBy: { createdAt: 'desc' }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }
    async getProviderJobs(providerId) {
        return await this.prisma.job.findMany({
            where: { providerId },
            include: {
                category: true,
                customer: true
            },
            orderBy: { createdAt: 'desc' }
        });
    }
    async getAvailableJobsForProvider(providerId) {
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
        if (!provider) {
            return [];
        }
        const categoryIds = provider.categories.map(pc => pc.categoryId);
        return await this.prisma.job.findMany({
            where: {
                status: client_1.JobStatus.BROADCASTED,
                categoryId: { in: categoryIds },
                type: client_1.JobType.QUICK_BOOK,
                quickBookDeadline: { gt: new Date() }
            },
            include: {
                category: true,
                customer: true
            },
            orderBy: { createdAt: 'desc' }
        });
    }
    async getJobById(jobId) {
        return await this.prisma.job.findUnique({
            where: { id: jobId },
            include: {
                category: true,
                customer: true,
                provider: true,
                bids: {
                    include: {
                        provider: {
                            include: {
                                provider: true
                            }
                        }
                    }
                },
                escrow: true
            }
        });
    }
    async cancelJob(jobId, userId) {
        const job = await this.prisma.job.findUnique({
            where: { id: jobId }
        });
        if (!job) {
            throw new Error('Job not found');
        }
        const isCustomer = job.customerId === userId;
        const isProvider = job.providerId === userId;
        if (!isCustomer && !isProvider) {
            throw new Error('Unauthorized');
        }
        const newStatus = isCustomer ?
            client_1.JobStatus.CANCELLED_BY_CUSTOMER :
            client_1.JobStatus.CANCELLED_BY_PROVIDER;
        const updatedJob = await this.prisma.job.update({
            where: { id: jobId },
            data: { status: newStatus }
        });
        // Handle escrow refund if needed
        if (job.status === client_1.JobStatus.BOOKED) {
            await this.prisma.escrow.updateMany({
                where: { jobId },
                data: {
                    status: 'REFUNDED',
                    refundedAt: new Date()
                }
            });
        }
        return updatedJob;
    }
    // Private helper methods
    async findNearbyProviders(lat, lon, radiusKm, categoryId) {
        // This is a simplified query - in production you'd use PostGIS
        const providers = await this.prisma.provider.findMany({
            where: {
                isAvailable: true,
                categories: {
                    some: {
                        categoryId
                    }
                }
            },
            include: {
                user: true
            }
        });
        return providers.filter(provider => {
            const distance = this.calculateDistance(lat, lon, provider.latitude, provider.longitude);
            return distance <= radiusKm;
        });
    }
    async broadcastToStage1(jobId) {
        const job = await this.prisma.job.findUnique({
            where: { id: jobId },
            include: { category: true }
        });
        if (!job)
            return;
        // Find Tier-A providers within 3km
        const tierAProviders = await this.prisma.provider.findMany({
            where: {
                isAvailable: true,
                tier: 'TIER_A',
                categories: {
                    some: {
                        categoryId: job.categoryId
                    }
                }
            }
        });
        const nearbyTierA = tierAProviders.filter(provider => {
            const distance = this.calculateDistance(job.latitude, job.longitude, provider.latitude, provider.longitude);
            return distance <= 3; // 3km radius
        });
        if (nearbyTierA.length > 0) {
            await this.prisma.job.update({
                where: { id: jobId },
                data: { status: client_1.JobStatus.BROADCASTED }
            });
            this.wsService.broadcastJobToProviders(job, nearbyTierA.map(p => p.userId));
        }
        // Schedule stage 2 broadcast after 5 minutes
        setTimeout(() => this.broadcastToStage2(jobId), 5 * 60 * 1000);
    }
    async broadcastToStage2(jobId) {
        const job = await this.prisma.job.findUnique({
            where: { id: jobId }
        });
        if (!job || job.status !== client_1.JobStatus.BROADCASTED)
            return;
        // Broadcast to wider radius (10km)
        await this.prisma.job.update({
            where: { id: jobId },
            data: { broadcastStage: 2 }
        });
        // Schedule stage 3 after another 10 minutes
        setTimeout(() => this.broadcastToStage3(jobId), 10 * 60 * 1000);
    }
    async broadcastToStage3(jobId) {
        const job = await this.prisma.job.findUnique({
            where: { id: jobId }
        });
        if (!job || job.status !== client_1.JobStatus.BROADCASTED)
            return;
        // Broadcast to everyone
        await this.prisma.job.update({
            where: { id: jobId },
            data: { broadcastStage: 3 }
        });
    }
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = this.deg2rad(lat2 - lat1);
        const dLon = this.deg2rad(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    deg2rad(deg) {
        return deg * (Math.PI / 180);
    }
    getPercentile(sortedArray, percentile) {
        const index = (percentile / 100) * (sortedArray.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index % 1;
        if (upper >= sortedArray.length)
            return sortedArray[sortedArray.length - 1];
        return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
    }
}
exports.JobService = JobService;
