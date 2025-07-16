const { logError } = require('../utils/logger');
const { sanitizeErrorMessage } = require('../utils/validation');

// 404 handler middleware
const notFoundHandler = (req, res, next) => {
    const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
    error.status = 404;
    next(error);
};

// Global error handler middleware
const errorHandler = (error, req, res, next) => {
    // Log the error using winston logger
    logError(error, req);

    const status = error.status || 500;
    const message = sanitizeErrorMessage(error.message) || 'Internal server error';

    // Don't expose stack traces in production
    const response = {
        error: message,
        status,
        timestamp: new Date().toISOString(),
        path: req.originalUrl
    };

    // Add additional details in development
    if (process.env.NODE_ENV !== 'production') {
        response.stack = error.stack;
        response.details = {
            method: req.method,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            body: req.body,
            params: req.params,
            query: req.query
        };
    }

    // Set appropriate status code for different error types
    if (error.name === 'ValidationError') {
        response.status = 400;
    } else if (error.name === 'UnauthorizedError') {
        response.status = 401;
    } else if (error.name === 'ForbiddenError') {
        response.status = 403;
    } else if (error.name === 'NotFoundError') {
        response.status = 404;
    } else if (error.name === 'ConflictError') {
        response.status = 409;
    } else if (error.name === 'TooManyRequestsError') {
        response.status = 429;
    }

    res.status(response.status).json(response);
};

// Async error handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
    notFoundHandler,
    errorHandler,
    asyncHandler
}; 