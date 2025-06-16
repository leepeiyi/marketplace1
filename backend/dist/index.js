"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const compression_1 = __importDefault(require("compression"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const client_1 = require("@prisma/client");
// Import routes
const jobs_js_1 = require("./routes/jobs.js");
const bids_js_1 = require("./routes/bids.js");
const users_js_1 = require("./routes/users.js");
const escrow_js_1 = require("./routes/escrow.js");
const categories_js_1 = require("./routes/categories.js");
// Import services
const websocket_js_1 = require("./services/websocket.js");
// Import middleware
const security_js_1 = require("./middleware/security.js");
const logging_js_1 = require("./middleware/logging.js");
const error_js_1 = require("./middleware/error.js");
const prisma = new client_1.PrismaClient();
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
// Trust proxy in production
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}
// Request ID middleware (should be first)
app.use(logging_js_1.requestId);
// Security middleware
app.use(security_js_1.securityHeaders);
app.use((0, compression_1.default)());
// CORS configuration
const corsOptions = {
    origin: process.env.NODE_ENV === 'production'
        ? process.env.ALLOWED_ORIGINS?.split(',') || false
        : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-user-type']
};
app.use((0, cors_1.default)(corsOptions));
// Logging middleware
if (process.env.NODE_ENV === 'production') {
    app.use(logging_js_1.prodLogger);
}
else {
    app.use(logging_js_1.devLogger);
}
// Body parsing middleware
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Rate limiting
app.use('/api/auth', security_js_1.authLimiter);
app.use('/api', security_js_1.apiLimiter);
app.use(security_js_1.generalLimiter);
// Middleware to add prisma to request context
app.use((req, res, next) => {
    req.prisma = prisma;
    next();
});
// Initialize Socket.IO with enhanced configuration
const io = new socket_io_1.Server(server, {
    cors: corsOptions,
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
    allowEIO3: true
});
// Initialize WebSocket service
const wsService = new websocket_js_1.WebSocketService(io);
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
        await prisma.$queryRaw `SELECT 1`;
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
    }
    catch (error) {
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
app.use('/api/users', users_js_1.userRoutes);
app.use('/api/categories', categories_js_1.categoryRoutes);
app.use('/api/jobs', jobs_js_1.jobRoutes);
app.use('/api/bids', bids_js_1.bidRoutes);
app.use('/api/escrow', escrow_js_1.escrowRoutes);
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
app.use('/api/*', error_js_1.notFound);
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
app.use('*', error_js_1.notFound);
// Global error handler (must be last)
app.use(error_js_1.errorHandler);
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
        }
        catch (err) {
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
    }
    catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
};
start();
