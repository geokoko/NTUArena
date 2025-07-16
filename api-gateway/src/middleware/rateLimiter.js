const rateLimit = require('express-rate-limit');

// Main API rate limiter
const apiRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests',
        message: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(15 * 60 * 1000 / 1000) // in seconds
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Strict rate limiter for sensitive endpoints
const strictRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 requests per windowMs
    message: {
        error: 'Too many requests',
        message: 'Too many requests to this sensitive endpoint, please try again later.',
        retryAfter: Math.ceil(15 * 60 * 1000 / 1000) // in seconds
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Health check rate limiter (more permissive)
const healthRateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // limit each IP to 30 requests per minute
    message: {
        error: 'Too many health check requests',
        message: 'Too many health check requests from this IP, please try again later.',
        retryAfter: Math.ceil(1 * 60 * 1000 / 1000) // in seconds
    },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = {
    apiRateLimiter,
    strictRateLimiter,
    healthRateLimiter
}; 