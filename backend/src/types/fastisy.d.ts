import { PrismaClient } from '@prisma/client';
import { WebSocketService } from '../services/websocket';

declare module 'fastify' {
  interface FastifyRequest {
    prisma: PrismaClient;
  }
  
  interface FastifyInstance {
    prisma: PrismaClient;
    wsService: WebSocketService;
  }
}

// Global type augmentation
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DATABASE_URL: string;
      NODE_ENV: 'development' | 'production' | 'test';
      PORT?: string;
    }
  }
}