"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRoutes = void 0;
// routes/users.js
const express_1 = require("express");
const zod_1 = require("zod");
const router = (0, express_1.Router)();
exports.userRoutes = router;
const CreateUserSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    name: zod_1.z.string().min(1),
    phone: zod_1.z.string().optional(),
    role: zod_1.z.enum(['CUSTOMER', 'PROVIDER'])
});
// Get user profile
router.get('/profile', async (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
    }
    try {
        const user = await req.prisma.user.findUnique({
            where: { id: userId },
            include: {
                provider: {
                    include: {
                        categories: {
                            include: {
                                category: true
                            }
                        }
                    }
                }
            }
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    }
    catch (error) {
        console.error('Error getting user profile:', error);
        res.status(500).json({ error: 'Failed to get user profile' });
    }
});
// Create or update user
router.post('/', async (req, res) => {
    try {
        CreateUserSchema.parse(req.body);
    }
    catch (error) {
        return res.status(400).json({ error: 'Invalid request body', details: error.errors });
    }
    try {
        const user = await req.prisma.user.upsert({
            where: { email: req.body.email },
            update: req.body,
            create: req.body
        });
        res.status(201).json(user);
    }
    catch (error) {
        console.error('Error creating/updating user:', error);
        res.status(500).json({ error: 'Failed to create/update user' });
    }
});
