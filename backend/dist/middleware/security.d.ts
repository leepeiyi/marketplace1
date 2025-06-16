export const securityHeaders: (req: import("http").IncomingMessage, res: import("http").ServerResponse, next: (err?: unknown) => void) => void;
export const generalLimiter: import("express-rate-limit").RateLimitRequestHandler;
export const authLimiter: import("express-rate-limit").RateLimitRequestHandler;
export const apiLimiter: import("express-rate-limit").RateLimitRequestHandler;
//# sourceMappingURL=security.d.ts.map