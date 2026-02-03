const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const gameCtrl = require('../controllers/gameController');

// Anyone can view a game 
router.get('/games/:id', gameCtrl.getGame);

// Admin submits the result of a game
router.post('/games/:id/result', requireAuth, requireRole('admin'), gameCtrl.submitResult);

module.exports = router;

