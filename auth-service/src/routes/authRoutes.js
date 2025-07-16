const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Authentication routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/validate-token', authController.validateToken);
router.post('/refresh-token', authController.refreshToken);

module.exports = router; 