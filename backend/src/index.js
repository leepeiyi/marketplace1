
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { createServer } from 'http';
import { PrismaClient } from '@prisma/client';
import { WebSocketService } from './services/websocket.js';

// Import routes
import { userRoutes } from './routes/users.js';
import { jobRoutes } from './routes/jobs.js';
import { categoryRoutes } from './routes/categories.js';
import { bidRoutes } from './routes/bids.js';
import { escrowRoutes } from './routes/escrow.js';

const app = express();
const server = createServer(app);
const prisma = new PrismaClient();
const wsService = new WebSocketService();

// Initialize WebSocket service
wsService.initialize(server);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Add Prisma and WebSocket service to request object
app.use((req, res, next) => {
  req.prisma = prisma;
  req.wsService = wsService;
  next();
});

app.post('/api/setup-db', async (req, res) => {
  try {
    // This will create the database if it doesn't exist
    await prisma.$executeRaw`SELECT 1`;
    res.json({ message: 'Database connected successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Make WebSocket service available to the app
app.set('wsService', wsService);

// Health check endpoint
app.get('/health', (req, res) => {
  try {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      websocket: wsService ? wsService.isHealthy() : false,
      connections: wsService ? wsService.getStats() : { error: 'WebSocket service not initialized' }
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// API Routes
app.use('/api/users', userRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/escrow', escrowRoutes);

// WebSocket stats endpoint (for debugging)
app.get('/api/ws/stats', (req, res) => {
  res.json(wsService.getStats());
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  
  server.close(() => {
    console.log('HTTP server closed');
    
    wsService.close();
    console.log('WebSocket server closed');
    
    prisma.$disconnect().then(() => {
      console.log('Database connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  
  server.close(() => {
    console.log('HTTP server closed');
    
    wsService.close();
    console.log('WebSocket server closed');
    
    prisma.$disconnect().then(() => {
      console.log('Database connection closed');
      process.exit(0);
    });
  });
});

const PORT = process.env.PORT || 3002;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket server available at ws://localhost:${PORT}/ws`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});