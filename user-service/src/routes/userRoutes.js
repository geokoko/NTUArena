const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

router.get('/', userController.getAllUsers);
router.get('/search', userController.searchUsers);
router.get('/:id', userController.getUserById);
router.get('/:id/statistics', userController.getUserStatistics);
router.post('/', userController.addUser);
router.put('/:id', userController.updateUser);
router.put('/:id/elo', userController.updateUserElo);
router.delete('/:id', userController.deleteUser);

module.exports = router; 