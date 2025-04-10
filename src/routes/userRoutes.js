const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Show user profile
router.get('/:id/profile', userController.getProfile);

// Add new user
router.post('/addUser', userController.addUser);

// Update user info
router.post('/:id/update', userController.updateUser);

// Delete user account
router.delete('/:id/delete', userController.deleteUser);

module.exports = router;

