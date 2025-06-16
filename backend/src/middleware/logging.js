// middleware/logging.js
import morgan from 'morgan';

// Custom token for user ID
morgan.token('user-id', (req) => {
  return req.userId || 'anonymous';
});

// Custom token for request duration in ms
morgan.token('response-time-ms', (req, res) => {
  const diff = process.hrtime(req._startAt);
  return (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
});

// Development logging format
export const devLogger = morgan(':method :url :status :response-time-ms ms - :user-id');

// Production logging format
export const prodLogger = morgan('combined', {
  skip: (req, res) => res.statusCode < 400 // Only log errors in production
});

// Request ID middleware
export const requestId = (req, res, next) => {
  req.id = Math.random().toString(36).substr(2, 9);
  res.set('X-Request-ID', req.id);
  next();
};