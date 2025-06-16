"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateQuery = exports.validateParams = exports.validateBody = void 0;
// middleware/validation.js
const zod_1 = require("zod");
const validateBody = (schema) => {
    return (req, res, next) => {
        try {
            const validated = schema.parse(req.body);
            req.body = validated; // Replace with validated data
            next();
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: error.errors.map(err => ({
                        field: err.path.join('.'),
                        message: err.message,
                        code: err.code
                    }))
                });
            }
            next(error);
        }
    };
};
exports.validateBody = validateBody;
const validateParams = (schema) => {
    return (req, res, next) => {
        try {
            const validated = schema.parse(req.params);
            req.params = validated;
            next();
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                return res.status(400).json({
                    error: 'Invalid parameters',
                    details: error.errors
                });
            }
            next(error);
        }
    };
};
exports.validateParams = validateParams;
const validateQuery = (schema) => {
    return (req, res, next) => {
        try {
            const validated = schema.parse(req.query);
            req.query = validated;
            next();
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                return res.status(400).json({
                    error: 'Invalid query parameters',
                    details: error.errors
                });
            }
            next(error);
        }
    };
};
exports.validateQuery = validateQuery;
