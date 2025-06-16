// routes/bids.js
import { Router } from 'express';
import { z } from 'zod';

const router = Router();

const CreateBidSchema = z.object({
  jobId: z.string(),
  price: z.number().positive(),
  note: z.string().optional(),
  estimatedEta: z.number().min(15).max(480) // 15 minutes to 8 hours
});

// Create bid
router.post('/', async (req, res) => {
  try {
    CreateBidSchema.parse(req.body);
  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
    console.error('Error getting bids:', error);
    res.status(500).json({ error: 'Failed to get bids' });
  }
});

export { router as bidRoutes };