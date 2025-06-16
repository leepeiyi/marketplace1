import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { PrismaClient } from '@prisma/client';

// Import routes
import { jobRoutes } from './routes/jobs.js';
import { bidRoutes } from './routes/bids.js';
import { userRoutes } from './routes/users.js';
import { escrowRoutes } from './routes/escrow.js';
import { categoryRoutes } from './routes/categories.js';

// Import services
import { WebSocketService } from './services/websocket.js';

// Import middleware
import { 
  securityHeaders, 
  generalLimiter, 
  authLimiter, 
  apiLimiter 
} from './middleware/security.js';
import { 
  devLogger, 
  prodLogger, 
  requestId 
} from './middleware/logging.js';
import { 
  notFound, 
  errorHandler 
} from './middleware/error.js';

const prisma = new PrismaClient();
const app = express();
const server = createServer(app);

// Trust proxy in production
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Request ID middleware (should be first)
app.use(requestId);

// Security middleware
app.use(securityHeaders);
app.use(compression());

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.ALLOWED_ORIGINS?.split(',') || false
    : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-user-type']
};
app.use(cors(corsOptions));

// Logging middleware
if (process.env.NODE_ENV === 'production') {
  app.use(prodLogger);
} else {
  app.use(devLogger);
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);
app.use(generalLimiter);

// Middleware to add prisma to request context
app.use((req, res, next) => {
  req.prisma = prisma;
  next();
});

// Initialize Socket.IO with enhanced configuration
const io = new SocketIOServer(server, {
  cors: corsOptions,
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Initialize WebSocket service
const wsService = new WebSocketService(io);

// Make WebSocket service available globally
app.set('wsService', wsService);

// Socket.IO connection handling with authentication
io.use((socket, next) => {
  const userId = socket.handshake.auth?.userId || 
                socket.handshake.query?.['x-user-id'] ||
                socket.handshake.headers['x-user-id'];
  
  const userType = socket.handshake.auth?.userType || 
                  socket.handshake.query?.['x-user-type'] ||
                  socket.handshake.headers['x-user-type'];

  if (!userId || !userType) {
    return next(new Error('Authentication required for WebSocket connection'));
  }

  socket.userId = userId;
  socket.userType = userType;
  next();
});

io.on('connection', (socket) => {
  console.log(`WebSocket connected: ${socket.userType} ${socket.userId}`);
  wsService.handleConnection(socket);
});

// Health check endpoint (before API routes)
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    
    // Get WebSocket stats
    const wsStats = wsService.getConnectionStats();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
      websocket: wsStats,
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// API status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    api: 'Quickly Marketplace API',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// Register API routes
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/escrow', escrowRoutes);

// WebSocket status endpoint
app.get('/api/ws/status', (req, res) => {
  const stats = wsService.getConnectionStats();
  res.json({
    ...stats,
    timestamp: new Date().toISOString()
  });
});

// Admin endpoint to send system announcements
app.post('/api/admin/announce', (req, res) => {
  const { message, type = 'info' } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  wsService.sendSystemAnnouncement(message, type);
  res.json({ success: true, message: 'Announcement sent' });
});

// 404 handler for API routes
app.use('/api/*', notFound);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Quickly Marketplace API',
    version: '1.0.0',
    docs: '/api/status',
    health: '/health'
  });
});

// Global 404 handler
app.use('*', notFound);

// Global error handler (must be last)
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`Received ${signal}. Starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close(async () => {
    try {
      console.log('HTTP server closed.');
      
      // Close WebSocket connections
      io.close(() => {
        console.log('WebSocket server closed.');
      });
      
      // Disconnect from database
      await prisma.$disconnect();
      console.log('Database connection closed.');
      
      console.log('Graceful shutdown completed.');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  });

  // Force close after 30 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

// Handle shutdown signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Start server
const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3002;
    const host = process.env.HOST || '0.0.0.0';
    
    server.listen(port, host, () => {
      console.log(`🚀 Server running on http://${host}:${port}`);
      console.log(`📡 WebSocket server ready`);
      console.log(`🗄️  Database connected`);
      console.log(`🛡️  Security middleware enabled`);
      console.log(`📊 Health check available at /health`);
      console.log(`📚 API status at /api/status`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

start();