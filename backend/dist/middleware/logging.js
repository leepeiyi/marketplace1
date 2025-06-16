"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestId = exports.prodLogger = exports.devLogger = void 0;
// middleware/logging.js
const morgan_1 = __importDefault(require("morgan"));
// Custom token for user ID
morgan_1.default.token('user-id', (req) => {
    return req.userId || 'anonymous';
});
// Custom token for request duration in ms
morgan_1.default.token('response-time-ms', (req, res) => {
    const diff = process.hrtime(req._startAt);
    return (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
});
// Development logging format
exports.devLogger = (0, morgan_1.default)(':method :url :status :response-time-ms ms - :user-id');
// Production logging format
exports.prodLogger = (0, morgan_1.default)('combined', {
    skip: (req, res) => res.statusCode < 400 // Only log errors in production
});
// Request ID middleware
const requestId = (req, res, next) => {
    req.id = Math.random().toString(36).substr(2, 9);
    res.set('X-Request-ID', req.id);
    next();
};
exports.requestId = requestId;
