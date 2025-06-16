import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { JobService } from '../services/job';

const CreateQuickBookJobSchema = z.object({
  categoryId: z.string(),
  title: z.string().min(1),
  description: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
  address: z.string().min(1),
  arrivalWindow: z.number().min(1).max(24) // hours from now
});

const CreatePostQuoteJobSchema = z.object({
  categoryId: z.string(),
  title: z.string().min(1),
  description: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
  address: z.string().min(1),
  acceptPrice: z.number().positive().optional()
});

const AcceptJobSchema = z.object({
  jobId: z.string()
});

export async function jobRoutes(fastify: FastifyInstance) {
  const jobService = new JobService(fastify.prisma, fastify.wsService);

  // Get price guidance for a category
  fastify.get('/price-guidance/:categoryId', async (request, reply) => {
    const { categoryId } = request.params as { categoryId: string };
    
    try {
      const guidance = await jobService.getPriceGuidance(categoryId);
      return guidance;
    } catch (error) {
      reply.status(500).send({ error: 'Failed to get price guidance' });
    }
  });

  // Create quick book job
  fastify.post('/quick-book', {
    preHandler: async (request, reply) => {
      try {
        CreateQuickBookJobSchema.parse(request.body);
      } catch (error) {
        reply.status(400).send({ error: 'Invalid request body', details: error });
      }
    }
  }, async (request, reply) => {
    const customerId = request.headers['x-user-id'] as string;
    if (!customerId) {
      return reply.status(401).send({ error: 'User ID required' });
    }

    const jobData = request.body as z.infer<typeof CreateQuickBookJobSchema>;

    try {
      const job = await jobService.createQuickBookJob(customerId, jobData);
      return job;
    } catch (error) {
      reply.status(500).send({ error: 'Failed to create job' });
    }
  });

  // Create post & quote job
  fastify.post('/post-quote', {
    preHandler: async (request, reply) => {
      try {
        CreatePostQuoteJobSchema.parse(request.body);
      } catch (error) {
        reply.status(400).send({ error: 'Invalid request body', details: error });
      }
    }
  }, async (request, reply) => {
    const customerId = request.headers['x-user-id'] as string;
    if (!customerId) {
      return reply.status(401).send({ error: 'User ID required' });
    }

    const jobData = request.body as z.infer<typeof CreatePostQuoteJobSchema>;

    try {
      const job = await jobService.createPostQuoteJob(customerId, jobData);
      return job;
    } catch (error) {
      reply.status(500).send({ error: 'Failed to create job' });
    }
  });

  // Provider accepts quick book job
  fastify.post('/accept', {
    preHandler: async (request, reply) => {
      try {
        AcceptJobSchema.parse(request.body);
      } catch (error) {
        reply.status(400).send({ error: 'Invalid request body', details: error });
      }
    }
  }, async (request, reply) => {
    const providerId = request.headers['x-user-id'] as string;
    if (!providerId) {
      return reply.status(401).send({ error: 'User ID required' });
    }

    const { jobId } = request.body as z.infer<typeof AcceptJobSchema>;

    try {
      const result = await jobService.acceptQuickBookJob(jobId, providerId);
      return result;
    } catch (error) {
      if (error.message === 'Job already taken') {
        return reply.status(409).send({ error: 'Job already taken' });
      }
      reply.status(500).send({ error: 'Failed to accept job' });
    }
  });

  // Get jobs for customer
  fastify.get('/customer', async (request, reply) => {
    const customerId = request.headers['x-user-id'] as string;
    if (!customerId) {
      return reply.status(401).send({ error: 'User ID required' });
    }

    try {
      const jobs = await jobService.getCustomerJobs(customerId);
      return jobs;
    } catch (error) {
      reply.status(500).send({ error: 'Failed to get jobs' });
    }
  });

  // Get jobs for provider
  fastify.get('/provider', async (request, reply) => {
    const providerId = request.headers['x-user-id'] as string;
    if (!providerId) {
      return reply.status(401).send({ error: 'User ID required' });
    }

    try {
      const jobs = await jobService.getProviderJobs(providerId);
      return jobs;
    } catch (error) {
      reply.status(500).send({ error: 'Failed to get jobs' });
    }
  });

  // Get available jobs for provider (within radius)
  fastify.get('/available', async (request, reply) => {
    const providerId = request.headers['x-user-id'] as string;
    if (!providerId) {
      return reply.status(401).send({ error: 'User ID required' });
    }

    try {
      const jobs = await jobService.getAvailableJobsForProvider(providerId);
      return jobs;
    } catch (error) {
      reply.status(500).send({ error: 'Failed to get available jobs' });
    }
  });

  // Get job details
  fastify.get('/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    
    try {
      const job = await jobService.getJobById(jobId);
      if (!job) {
        return reply.status(404).send({ error: 'Job not found' });
      }
      return job;
    } catch (error) {
      reply.status(500).send({ error: 'Failed to get job' });
    }
  });

  // Cancel job
  fastify.post('/:jobId/cancel', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const userId = request.headers['x-user-id'] as string;
    
    if (!userId) {
      return reply.status(401).send({ error: 'User ID required' });
    }

    try {
      const result = await jobService.cancelJob(jobId, userId);
      return result;
    } catch (error) {
      reply.status(500).send({ error: 'Failed to cancel job' });
    }
  });
}