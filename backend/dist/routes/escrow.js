"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.escrowRoutes = void 0;
// routes/escrow.js
const express_1 = require("express");
const router = (0, express_1.Router)();
exports.escrowRoutes = router;
// Get escrow status for job
router.get('/job/:jobId', async (req, res) => {
    const { jobId } = req.params;
    try {
        const escrow = await req.prisma.escrow.findUnique({
            where: { jobId },
            include: {
                job: {
                    include: {
                        customer: true,
                        provider: true
                    }
                }
            }
        });
        if (!escrow) {
            return res.status(404).json({ error: 'Escrow not found' });
        }
        res.json(escrow);
    }
    catch (error) {
        console.error('Error getting escrow:', error);
        res.status(500).json({ error: 'Failed to get escrow' });
    }
});
// Release escrow
router.post('/:escrowId/release', async (req, res) => {
    const { escrowId } = req.params;
    const userId = req.headers['x-user-id'];
    if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
    }
    try {
        const escrow = await req.prisma.escrow.findUnique({
            where: { id: escrowId },
            include: {
                job: {
                    include: {
                        customer: true,
                        provider: true
                    }
                }
            }
        });
        if (!escrow) {
            return res.status(404).json({ error: 'Escrow not found' });
        }
        // Only customer can release escrow
        if (escrow.job.customerId !== userId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        if (escrow.status !== 'HELD') {
            return res.status(400).json({ error: 'Escrow not in held status' });
        }
        const updatedEscrow = await req.prisma.escrow.update({
            where: { id: escrowId },
            data: {
                status: 'RELEASED',
                releasedAt: new Date()
            }
        });
        // Notify provider
        const wsService = req.app.get('wsService');
        wsService.notifyProvider(escrow.job.providerId, {
            type: 'escrow_released',
            escrow: updatedEscrow,
            amount: escrow.amount
        });
        res.json(updatedEscrow);
    }
    catch (error) {
        console.error('Error releasing escrow:', error);
        res.status(500).json({ error: 'Failed to release escrow' });
    }
});
