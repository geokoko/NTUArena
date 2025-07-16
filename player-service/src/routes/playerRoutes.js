const express = require('express');
const router = express.Router();
const playerController = require('../controllers/playerController');

// Get player stats
router.get('/:userId/tournament/:tournamentId/stats', playerController.getPlayerStats);

// Get all players in a tournament
router.get('/tournament/:tournamentId', playerController.getPlayersByTournament);

// Update player after game
router.put('/:playerId/game-result', playerController.updatePlayerAfterGame);

module.exports = router; 