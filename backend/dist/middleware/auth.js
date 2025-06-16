"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = exports.requireAuth = void 0;
// middleware/auth.js
const requireAuth = (req, res, next) => {
    const userId = req.headers['x-user-id'] || req.headers['authorization']?.replace('Bearer ', '');
    if (!userId) {
        return res.status(401).json({
            error: 'Authentication required',
            message: 'Please provide a valid user ID'
        });
    }
    req.userId = userId;
    next();
};
exports.requireAuth = requireAuth;
const requireRole = (roles) => {
    return async (req, res, next) => {
        try {
            const user = await req.prisma.user.findUnique({
                where: { id: req.userId }
            });
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            if (!roles.includes(user.role)) {
                return res.status(403).json({
                    error: 'Insufficient permissions',
                    required: roles,
                    current: user.role
                });
            }
            req.user = user;
            next();
        }
        catch (error) {
            console.error('Error checking user role:', error);
            res.status(500).json({ error: 'Authentication error' });
        }
    };
};
exports.requireRole = requireRole;
