const express = require('express');
const router = express.Router();
const healthRoutes = require('./healthRoutes');
const { apiRateLimiter } = require('../middleware/rateLimiter');

// Apply rate limiting to all API routes
router.use(apiRateLimiter);

// Health check routes
router.use('/health', healthRoutes);

// API information endpoint
router.get('/', (req, res) => {
    res.json({
        name: 'ArenaManager API Gateway',
        version: '1.0.0',
        description: 'API Gateway for ArenaManager microservices',
        endpoints: {
            health: '/health',
            services: '/health/services',
            auth: '/api/auth',
            users: '/api/users',
            tournaments: '/api/tournaments',
            players: '/api/players',
            games: '/api/games',
            pairing: '/api/pairing'
        },
        timestamp: new Date().toISOString()
    });
});

module.exports = router; 