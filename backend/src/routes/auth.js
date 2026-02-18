const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

// Public routes
router.get('/auth/status', authController.getAuthStatus);
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);

// Protected routes
router.get('/auth/me', requireAuth, authController.getMe);

module.exports = router;
