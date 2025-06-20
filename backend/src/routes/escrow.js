// routes/escrow.js
import { Router } from 'express';

const router = Router();

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
  } catch (error) {
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
  } catch (error) {
    console.error('Error releasing escrow:', error);
    res.status(500).json({ error: 'Failed to release escrow' });
  }
});

// Create escrow hold when customer accepts bid
router.post('/hold', async (req, res) => {
  const { jobId, bidId, amount } = req.body;
  const userId = req.headers['x-user-id'];

  if (!userId) {
    return res.status(401).json({ error: 'User ID required' });
  }

  if (!jobId || !bidId || !amount) {
    return res.status(400).json({ error: 'Missing jobId, bidId, or amount' });
  }

  try {
    // Check job and bid validity
    const job = await req.prisma.job.findUnique({ where: { id: jobId } });
    const bid = await req.prisma.bid.findUnique({ where: { id: bidId } });

    if (!job || !bid || job.customerId !== userId) {
      return res.status(403).json({ error: 'Unauthorized or invalid job/bid' });
    }

    // Prevent multiple escrow holds
    const existing = await req.prisma.escrow.findUnique({ where: { jobId } });
    if (existing) {
      return res.status(409).json({ error: 'Escrow already created' });
    }

    const escrow = await req.prisma.escrow.create({
      data: {
        jobId,
        customerId: userId,
        providerId: bid.providerId,
        bidId,
        amount,
        status: 'HELD',
        heldAt: new Date()
      }
    });

    // Mark job as BOOKED
    await req.prisma.job.update({
      where: { id: jobId },
      data: { status: 'BOOKED' }
    });

    // Notify provider via WebSocket
    const wsService = req.app.get('wsService');
    wsService.notifyProvider(bid.providerId, {
      type: 'job_accepted',
      job: {
        id: job.id,
        title: job.title,
        providerName: bid.providerName || 'Customer',
        amount
      }
    });

    res.json({ escrow });
  } catch (error) {
    console.error('Error creating escrow hold:', error);
    res.status(500).json({ error: 'Failed to create escrow hold' });
  }
});


export { router as escrowRoutes };