
import rateLimit from 'express-rate-limit';

export const writeLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per minute
  message: {
    error: 'Too many requests. Please try again later.',
  },
  standardHeaders: true, // adds RateLimit-* headers
  legacyHeaders: false,
});
