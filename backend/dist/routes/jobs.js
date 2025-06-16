"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobRoutes = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const job_js_1 = require("../services/job.js");
const router = (0, express_1.Router)();
exports.jobRoutes = router;
const CreateQuickBookJobSchema = zod_1.z.object({
    categoryId: zod_1.z.string(),
    title: zod_1.z.string().min(1),
    description: zod_1.z.string().min(1),
    latitude: zod_1.z.number(),
    longitude: zod_1.z.number(),
    address: zod_1.z.string().min(1),
    arrivalWindow: zod_1.z.number().min(1).max(24) // hours from now
});
const CreatePostQuoteJobSchema = zod_1.z.object({
    categoryId: zod_1.z.string(),
    title: zod_1.z.string().min(1),
    description: zod_1.z.string().min(1),
    latitude: zod_1.z.number(),
    longitude: zod_1.z.number(),
    address: zod_1.z.string().min(1),
    acceptPrice: zod_1.z.number().positive().optional()
});
const AcceptJobSchema = zod_1.z.object({
    jobId: zod_1.z.string()
});
// Validation middleware
const validateBody = (schema) => {
    return (req, res, next) => {
        try {
            schema.parse(req.body);
            next();
        }
        catch (error) {
            return res.status(400).json({
                error: 'Invalid request body',
                details: error.errors
            });
        }
    };
};
// Authentication middleware
const requireAuth = (req, res, next) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
        return res.status(401).json({ error: 'User ID required' });
    }
    req.userId = userId;
    next();
};
// Get price guidance for a category
router.get('/price-guidance/:categoryId', async (req, res) => {
    const { categoryId } = req.params;
    try {
        const jobService = new job_js_1.JobService(req.prisma, req.app.get('wsService'));
        const guidance = await jobService.getPriceGuidance(categoryId);
        res.json(guidance);
    }
    catch (error) {
        console.error('Error getting price guidance:', error);
        res.status(500).json({ error: 'Failed to get price guidance' });
    }
});
// Create quick book job
router.post('/quick-book', requireAuth, validateBody(CreateQuickBookJobSchema), async (req, res) => {
    try {
        const jobService = new job_js_1.JobService(req.prisma, req.app.get('wsService'));
        const job = await jobService.createQuickBookJob(req.userId, req.body);
        res.status(201).json(job);
    }
    catch (error) {
        console.error('Error creating quick book job:', error);
        res.status(500).json({ error: 'Failed to create job' });
    }
});
// Create post & quote job
router.post('/post-quote', requireAuth, validateBody(CreatePostQuoteJobSchema), async (req, res) => {
    try {
        const jobService = new job_js_1.JobService(req.prisma, req.app.get('wsService'));
        const job = await jobService.createPostQuoteJob(req.userId, req.body);
        res.status(201).json(job);
    }
    catch (error) {
        console.error('Error creating post quote job:', error);
        res.status(500).json({ error: 'Failed to create job' });
    }
});
// Provider accepts quick book job
router.post('/accept', requireAuth, validateBody(AcceptJobSchema), async (req, res) => {
    try {
        const jobService = new job_js_1.JobService(req.prisma, req.app.get('wsService'));
        const { jobId } = req.body;
        const result = await jobService.acceptQuickBookJob(jobId, req.userId);
        res.json(result);
    }
    catch (error) {
        console.error('Error accepting job:', error);
        if (error.message === 'Job already taken') {
            return res.status(409).json({ error: 'Job already taken' });
        }
        res.status(500).json({ error: 'Failed to accept job' });
    }
});
// Get jobs for customer
router.get('/customer', requireAuth, async (req, res) => {
    try {
        const jobService = new job_js_1.JobService(req.prisma, req.app.get('wsService'));
        const jobs = await jobService.getCustomerJobs(req.userId);
        res.json(jobs);
    }
    catch (error) {
        console.error('Error getting customer jobs:', error);
        res.status(500).json({ error: 'Failed to get jobs' });
    }
});
// Get jobs for provider
router.get('/provider', requireAuth, async (req, res) => {
    try {
        const jobService = new job_js_1.JobService(req.prisma, req.app.get('wsService'));
        const jobs = await jobService.getProviderJobs(req.userId);
        res.json(jobs);
    }
    catch (error) {
        console.error('Error getting provider jobs:', error);
        res.status(500).json({ error: 'Failed to get jobs' });
    }
});
// Get available jobs for provider (within radius)
router.get('/available', requireAuth, async (req, res) => {
    try {
        const jobService = new job_js_1.JobService(req.prisma, req.app.get('wsService'));
        const jobs = await jobService.getAvailableJobsForProvider(req.userId);
        res.json(jobs);
    }
    catch (error) {
        console.error('Error getting available jobs:', error);
        res.status(500).json({ error: 'Failed to get available jobs' });
    }
});
// Get job details
router.get('/:jobId', async (req, res) => {
    const { jobId } = req.params;
    try {
        const jobService = new job_js_1.JobService(req.prisma, req.app.get('wsService'));
        const job = await jobService.getJobById(jobId);
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }
        res.json(job);
    }
    catch (error) {
        console.error('Error getting job:', error);
        res.status(500).json({ error: 'Failed to get job' });
    }
});
// Cancel job
router.post('/:jobId/cancel', requireAuth, async (req, res) => {
    const { jobId } = req.params;
    try {
        const jobService = new job_js_1.JobService(req.prisma, req.app.get('wsService'));
        const result = await jobService.cancelJob(jobId, req.userId);
        res.json(result);
    }
    catch (error) {
        console.error('Error canceling job:', error);
        res.status(500).json({ error: 'Failed to cancel job' });
    }
});
