const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');
const { healthRateLimiter } = require('../middleware/rateLimiter');
const { asyncHandler } = require('../middleware/errorHandler');

// Gateway health check
router.get('/', healthRateLimiter, asyncHandler(healthController.getGatewayHealth));

// All services health check
router.get('/services', healthRateLimiter, asyncHandler(healthController.getAllServicesHealth));

// Individual service health check
router.get('/services/:serviceName', healthRateLimiter, asyncHandler(healthController.getServiceHealth));

module.exports = router; 