"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.notFound = void 0;
// middleware/error.js
const notFound = (req, res, next) => {
    const error = new Error(`Route not found - ${req.originalUrl}`);
    error.status = 404;
    next(error);
};
exports.notFound = notFound;
const errorHandler = (error, req, res, next) => {
    let statusCode = error.status || error.statusCode || 500;
    let message = error.message || 'Internal Server Error';
    // Prisma errors
    if (error.code === 'P2002') {
        statusCode = 400;
        message = 'A record with this data already exists';
    }
    else if (error.code === 'P2025') {
        statusCode = 404;
        message = 'Record not found';
    }
    else if (error.code?.startsWith('P')) {
        statusCode = 400;
        message = 'Database operation failed';
    }
    // Validation errors
    if (error.name === 'ValidationError') {
        statusCode = 400;
        message = 'Validation failed';
    }
    // JWT errors
    if (error.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = 'Invalid token';
    }
    else if (error.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'Token expired';
    }
    console.error(`Error ${statusCode}: ${message}`, {
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    res.status(statusCode).json({
        error: message,
        ...(process.env.NODE_ENV === 'development' && {
            stack: error.stack,
            details: error
        }),
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
        method: req.method
    });
};
exports.errorHandler = errorHandler;
