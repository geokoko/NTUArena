const express = require('express');
const router = express.Router();
const playerController = require('../controllers/playerController');

// Route to get the player count
router.get('/count', playerController.getPlayerCount);

// Route to add a new player
router.post('/', playerController.addPlayer);

// Route to change the playing state of a player
router.post('/changePlayingState', playerController.changePlayingState);

module.exports = router;
