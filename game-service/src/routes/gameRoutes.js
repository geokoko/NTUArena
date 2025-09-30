const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');

// Submit game result
router.post('/:gameId/result', gameController.submitGameResult);

// Alias for frontend compatibility
router.post('/:gameId/submitResult', gameController.submitGameResult);

// Get game by ID
router.get('/:gameId', gameController.getGameById);

// Get games by tournament
router.get('/tournament/:tournamentId', gameController.getGamesByTournament);

// Get active games by tournament
router.get('/tournament/:tournamentId/active', gameController.getActiveGamesByTournament);

// Get games by player
router.get('/player/:playerId', gameController.getGamesByPlayer);

module.exports = router; 
