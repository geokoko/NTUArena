const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const gameCtrl = require('../controllers/gameController');

// Anyone can view a game 
router.get('/games/:id', gameCtrl.getGame);

// Admin submits the result of a game
router.post('/games/:id/result', requireAuth, requireRole('admin'), gameCtrl.submitResult);
// Admin corrects the result of a finished game
router.put('/games/:id/result', requireAuth, requireRole('admin'), gameCtrl.correctResult);
// Admin undoes a result entered on a game that is still being played
router.post('/games/:id/reopen', requireAuth, requireRole('admin'), gameCtrl.reopenGame);
router.post('/games/:id/cancel', requireAuth, requireRole('admin'), gameCtrl.cancelGame);

module.exports = router;
