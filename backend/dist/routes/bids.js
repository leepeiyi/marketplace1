"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bidRoutes = void 0;
// routes/bids.js
const express_1 = require("express");
const zod_1 = require("zod");
const router = (0, express_1.Router)();
exports.bidRoutes = router;
const CreateBidSchema = zod_1.z.object({
    jobId: zod_1.z.string(),
    price: zod_1.z.number().positive(),
    note: zod_1.z.string().optional(),
    estimatedEta: zod_1.z.number().min(15).max(480) // 15 minutes to 8 hours
});
// Create bid
router.post('/', async (req, res) => {
    try {
        CreateBidSchema.parse(req.body);
    }
    catch (error) {
        return res.status(400).json({ error: 'Invalid request body', details: error.errors });
    }
    const providerId = req.headers['x-user-id'];
    if (!providerId) {
        return res.status(401).json({ error: 'User ID required' });
    }
    try {
        const bid = await req.prisma.bid.create({
            data: {
                ...req.body,
                providerId
            },
            include: {
                provider: {
                    include: {
                        provider: true
                    }
                },
                job: {
                    include: {
                        customer: true
                    }
                }
            }
        });
        // Notify customer of new bid
        const wsService = req.app.get('wsService');
        wsService.notifyCustomer(bid.job.customerId, {
            type: 'bid_received',
            bid: {
                id: bid.id,
                price: bid.price,
                providerName: bid.provider.name,
                estimatedEta: bid.estimatedEta
            }
        });
        res.status(201).json(bid);
    }
    catch (error) {
        console.error('Error creating bid:', error);
        res.status(500).json({ error: 'Failed to create bid' });
    }
});
// Get bids for a job
router.get('/job/:jobId', async (req, res) => {
    const { jobId } = req.params;
    try {
        const bids = await req.prisma.bid.findMany({
            where: { jobId },
            include: {
                provider: {
                    include: {
                        provider: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(bids);
    }
    catch (error) {
        console.error('Error getting bids:', error);
        res.status(500).json({ error: 'Failed to get bids' });
    }
});
