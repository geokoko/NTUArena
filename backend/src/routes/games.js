// routes/gameRoutes.js
const express = require('express');
const router = express.Router();
//const { requireAuth } = require('../middleware/auth');
const gameCtrl = require('../controllers/gameController');

// Anyone can view a game 
router.get('/games/:id', gameCtrl.getGame);

// admin submits the result of a game
router.post('/games/:id/result', gameCtrl.submitResult);

module.exports = router;

