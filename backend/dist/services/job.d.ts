import { PrismaClient } from '@prisma/client';
import { WebSocketService } from './websocket';
interface CreateQuickBookJobData {
    categoryId: string;
    title: string;
    description: string;
    latitude: number;
    longitude: number;
    address: string;
    arrivalWindow: number;
}
interface CreatePostQuoteJobData {
    categoryId: string;
    title: string;
    description: string;
    latitude: number;
    longitude: number;
    address: string;
    acceptPrice?: number;
}
export declare class JobService {
    private prisma;
    private wsService;
    constructor(prisma: PrismaClient, wsService: WebSocketService);
    getPriceGuidance(categoryId: string): Promise<{
        p10: number;
        p50: number;
        p90: number;
    }>;
    createQuickBookJob(customerId: string, data: CreateQuickBookJobData): Promise<{
        customer: {
            id: string;
            createdAt: Date;
            name: string;
            updatedAt: Date;
            email: string;
            phone: string | null;
            role: import(".prisma/client").$Enums.UserRole;
        };
        category: {
            id: string;
            createdAt: Date;
            name: string;
            description: string | null;
            updatedAt: Date;
            icon: string | null;
            isActive: boolean;
        };
    } & {
        id: string;
        categoryId: string;
        completedAt: Date | null;
        createdAt: Date;
        customerId: string;
        providerId: string | null;
        title: string;
        description: string;
        type: import(".prisma/client").$Enums.JobType;
        status: import(".prisma/client").$Enums.JobStatus;
        estimatedPrice: number | null;
        acceptPrice: number | null;
        finalPrice: number | null;
        latitude: number;
        longitude: number;
        address: string;
        scheduledAt: Date | null;
        arrivalWindow: number | null;
        quickBookDeadline: Date | null;
        biddingEndsAt: Date | null;
        broadcastStage: number;
        lastBroadcastAt: Date | null;
        updatedAt: Date;
    }>;
    createPostQuoteJob(customerId: string, data: CreatePostQuoteJobData): Promise<{
        customer: {
            id: string;
            createdAt: Date;
            name: string;
            updatedAt: Date;
            email: string;
            phone: string | null;
            role: import(".prisma/client").$Enums.UserRole;
        };
        category: {
            id: string;
            createdAt: Date;
            name: string;
            description: string | null;
            updatedAt: Date;
            icon: string | null;
            isActive: boolean;
        };
    } & {
        id: string;
        categoryId: string;
        completedAt: Date | null;
        createdAt: Date;
        customerId: string;
        providerId: string | null;
        title: string;
        description: string;
        type: import(".prisma/client").$Enums.JobType;
        status: import(".prisma/client").$Enums.JobStatus;
        estimatedPrice: number | null;
        acceptPrice: number | null;
        finalPrice: number | null;
        latitude: number;
        longitude: number;
        address: string;
        scheduledAt: Date | null;
        arrivalWindow: number | null;
        quickBookDeadline: Date | null;
        biddingEndsAt: Date | null;
        broadcastStage: number;
        lastBroadcastAt: Date | null;
        updatedAt: Date;
    }>;
    acceptQuickBookJob(jobId: string, providerId: string): Promise<{
        provider: {
            id: string;
            createdAt: Date;
            name: string;
            updatedAt: Date;
            email: string;
            phone: string | null;
            role: import(".prisma/client").$Enums.UserRole;
        } | null;
        customer: {
            id: string;
            createdAt: Date;
            name: string;
            updatedAt: Date;
            email: string;
            phone: string | null;
            role: import(".prisma/client").$Enums.UserRole;
        };
        category: {
            id: string;
            createdAt: Date;
            name: string;
            description: string | null;
            updatedAt: Date;
            icon: string | null;
            isActive: boolean;
        };
    } & {
        id: string;
        categoryId: string;
        completedAt: Date | null;
        createdAt: Date;
        customerId: string;
        providerId: string | null;
        title: string;
        description: string;
        type: import(".prisma/client").$Enums.JobType;
        status: import(".prisma/client").$Enums.JobStatus;
        estimatedPrice: number | null;
        acceptPrice: number | null;
        finalPrice: number | null;
        latitude: number;
        longitude: number;
        address: string;
        scheduledAt: Date | null;
        arrivalWindow: number | null;
        quickBookDeadline: Date | null;
        biddingEndsAt: Date | null;
        broadcastStage: number;
        lastBroadcastAt: Date | null;
        updatedAt: Date;
    }>;
    getCustomerJobs(customerId: string): Promise<({
        provider: {
            id: string;
            createdAt: Date;
            name: string;
            updatedAt: Date;
            email: string;
            phone: string | null;
            role: import(".prisma/client").$Enums.UserRole;
        } | null;
        category: {
            id: string;
            createdAt: Date;
            name: string;
            description: string | null;
            updatedAt: Date;
            icon: string | null;
            isActive: boolean;
        };
        bids: ({
            provider: {
                provider: {
                    id: string;
                    createdAt: Date;
                    latitude: number;
                    longitude: number;
                    updatedAt: Date;
                    userId: string;
                    isAvailable: boolean;
                    completedJobs: number;
                    averageRating: number;
                    totalRatings: number;
                    tier: import(".prisma/client").$Enums.ProviderTier;
                    reliabilityScore: number;
                } | null;
            } & {
                id: string;
                createdAt: Date;
                name: string;
                updatedAt: Date;
                email: string;
                phone: string | null;
                role: import(".prisma/client").$Enums.UserRole;
            };
        } & {
            id: string;
            price: number;
            createdAt: Date;
            providerId: string;
            status: import(".prisma/client").$Enums.BidStatus;
            updatedAt: Date;
            jobId: string;
            note: string | null;
            estimatedEta: number;
            score: number | null;
        })[];
    } & {
        id: string;
        categoryId: string;
        completedAt: Date | null;
        createdAt: Date;
        customerId: string;
        providerId: string | null;
        title: string;
        description: string;
        type: import(".prisma/client").$Enums.JobType;
        status: import(".prisma/client").$Enums.JobStatus;
        estimatedPrice: number | null;
        acceptPrice: number | null;
        finalPrice: number | null;
        latitude: number;
        longitude: number;
        address: string;
        scheduledAt: Date | null;
        arrivalWindow: number | null;
        quickBookDeadline: Date | null;
        biddingEndsAt: Date | null;
        broadcastStage: number;
        lastBroadcastAt: Date | null;
        updatedAt: Date;
    })[]>;
    getProviderJobs(providerId: string): Promise<({
        customer: {
            id: string;
            createdAt: Date;
            name: string;
            updatedAt: Date;
            email: string;
            phone: string | null;
            role: import(".prisma/client").$Enums.UserRole;
        };
        category: {
            id: string;
            createdAt: Date;
            name: string;
            description: string | null;
            updatedAt: Date;
            icon: string | null;
            isActive: boolean;
        };
    } & {
        id: string;
        categoryId: string;
        completedAt: Date | null;
        createdAt: Date;
        customerId: string;
        providerId: string | null;
        title: string;
        description: string;
        type: import(".prisma/client").$Enums.JobType;
        status: import(".prisma/client").$Enums.JobStatus;
        estimatedPrice: number | null;
        acceptPrice: number | null;
        finalPrice: number | null;
        latitude: number;
        longitude: number;
        address: string;
        scheduledAt: Date | null;
        arrivalWindow: number | null;
        quickBookDeadline: Date | null;
        biddingEndsAt: Date | null;
        broadcastStage: number;
        lastBroadcastAt: Date | null;
        updatedAt: Date;
    })[]>;
    getAvailableJobsForProvider(providerId: string): Promise<({
        customer: {
            id: string;
            createdAt: Date;
            name: string;
            updatedAt: Date;
            email: string;
            phone: string | null;
            role: import(".prisma/client").$Enums.UserRole;
        };
        category: {
            id: string;
            createdAt: Date;
            name: string;
            description: string | null;
            updatedAt: Date;
            icon: string | null;
            isActive: boolean;
        };
    } & {
        id: string;
        categoryId: string;
        completedAt: Date | null;
        createdAt: Date;
        customerId: string;
        providerId: string | null;
        title: string;
        description: string;
        type: import(".prisma/client").$Enums.JobType;
        status: import(".prisma/client").$Enums.JobStatus;
        estimatedPrice: number | null;
        acceptPrice: number | null;
        finalPrice: number | null;
        latitude: number;
        longitude: number;
        address: string;
        scheduledAt: Date | null;
        arrivalWindow: number | null;
        quickBookDeadline: Date | null;
        biddingEndsAt: Date | null;
        broadcastStage: number;
        lastBroadcastAt: Date | null;
        updatedAt: Date;
    })[]>;
    getJobById(jobId: string): Promise<({
        provider: {
            id: string;
            createdAt: Date;
            name: string;
            updatedAt: Date;
            email: string;
            phone: string | null;
            role: import(".prisma/client").$Enums.UserRole;
        } | null;
        customer: {
            id: string;
            createdAt: Date;
            name: string;
            updatedAt: Date;
            email: string;
            phone: string | null;
            role: import(".prisma/client").$Enums.UserRole;
        };
        category: {
            id: string;
            createdAt: Date;
            name: string;
            description: string | null;
            updatedAt: Date;
            icon: string | null;
            isActive: boolean;
        };
        bids: ({
            provider: {
                provider: {
                    id: string;
                    createdAt: Date;
                    latitude: number;
                    longitude: number;
                    updatedAt: Date;
                    userId: string;
                    isAvailable: boolean;
                    completedJobs: number;
                    averageRating: number;
                    totalRatings: number;
                    tier: import(".prisma/client").$Enums.ProviderTier;
                    reliabilityScore: number;
                } | null;
            } & {
                id: string;
                createdAt: Date;
                name: string;
                updatedAt: Date;
                email: string;
                phone: string | null;
                role: import(".prisma/client").$Enums.UserRole;
            };
        } & {
            id: string;
            price: number;
            createdAt: Date;
            providerId: string;
            status: import(".prisma/client").$Enums.BidStatus;
            updatedAt: Date;
            jobId: string;
            note: string | null;
            estimatedEta: number;
            score: number | null;
        })[];
        escrow: {
            id: string;
            createdAt: Date;
            status: import(".prisma/client").$Enums.EscrowStatus;
            updatedAt: Date;
            jobId: string;
            amount: number;
            heldAt: Date;
            releasedAt: Date | null;
            refundedAt: Date | null;
        } | null;
    } & {
        id: string;
        categoryId: string;
        completedAt: Date | null;
        createdAt: Date;
        customerId: string;
        providerId: string | null;
        title: string;
        description: string;
        type: import(".prisma/client").$Enums.JobType;
        status: import(".prisma/client").$Enums.JobStatus;
        estimatedPrice: number | null;
        acceptPrice: number | null;
        finalPrice: number | null;
        latitude: number;
        longitude: number;
        address: string;
        scheduledAt: Date | null;
        arrivalWindow: number | null;
        quickBookDeadline: Date | null;
        biddingEndsAt: Date | null;
        broadcastStage: number;
        lastBroadcastAt: Date | null;
        updatedAt: Date;
    }) | null>;
    cancelJob(jobId: string, userId: string): Promise<{
        id: string;
        categoryId: string;
        completedAt: Date | null;
        createdAt: Date;
        customerId: string;
        providerId: string | null;
        title: string;
        description: string;
        type: import(".prisma/client").$Enums.JobType;
        status: import(".prisma/client").$Enums.JobStatus;
        estimatedPrice: number | null;
        acceptPrice: number | null;
        finalPrice: number | null;
        latitude: number;
        longitude: number;
        address: string;
        scheduledAt: Date | null;
        arrivalWindow: number | null;
        quickBookDeadline: Date | null;
        biddingEndsAt: Date | null;
        broadcastStage: number;
        lastBroadcastAt: Date | null;
        updatedAt: Date;
    }>;
    private findNearbyProviders;
    private broadcastToStage1;
    private broadcastToStage2;
    private broadcastToStage3;
    private calculateDistance;
    private deg2rad;
    private getPercentile;
}
export {};
//# sourceMappingURL=job.d.ts.map