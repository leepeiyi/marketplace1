import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { PrismaClient } from '@prisma/client';
import { jobRoutes } from './routes/jobs';
import { bidRoutes } from './routes/bids';
import { userRoutes } from './routes/users';
import { escrowRoutes } from './routes/escrow';
import { categoryRoutes } from './routes/categories';
import { WebSocketService } from './services/websocket';

const prisma = new PrismaClient();
const fastify = Fastify({ logger: true });

// Register plugins
fastify.register(cors, {
  origin: process.env.NODE_ENV === 'production' ? false : true
});

fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
});

fastify.register(websocket);

// Middleware to add prisma to request context
fastify.decorateRequest('prisma', null);
fastify.addHook('onRequest', async (request) => {
  request.prisma = prisma;
});

// Initialize WebSocket service
const wsService = new WebSocketService();
fastify.register(async function (fastify) {
  fastify.get('/ws', { websocket: true }, (connection, req) => {
    wsService.handleConnection(connection, req);
  });
});

// Make WebSocket service available globally
fastify.decorate('wsService', wsService);

// Register routes
fastify.register(userRoutes, { prefix: '/api/users' });
fastify.register(categoryRoutes, { prefix: '/api/categories' });
fastify.register(jobRoutes, { prefix: '/api/jobs' });
fastify.register(bidRoutes, { prefix: '/api/bids' });
fastify.register(escrowRoutes, { prefix: '/api/escrow' });

// Health check
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Graceful shutdown
process.on('SIGINT', async () => {
  try {
    await fastify.close();
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});

// Start server
const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3001;
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`Server running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();