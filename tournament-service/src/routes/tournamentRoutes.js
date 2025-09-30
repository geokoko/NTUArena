const express = require('express');
const router = express.Router();
const tournamentController = require('../controllers/tournamentController');

// Create tournament
router.post('/', tournamentController.createTournament);

// Get all tournaments
router.get('/', tournamentController.getAllTournaments);

// Start tournament
router.post('/:id/start', tournamentController.startTournament);

// End tournament
router.post('/:id/end', tournamentController.endTournament);

// Get tournament by id
router.get('/:id', tournamentController.getTournamentById);

// Get tournament standings
router.get('/:id/standings', tournamentController.getTournamentStandings);

// Join tournament (frontend-compatible)
router.post('/:id/join', tournamentController.joinTournament);

// Leave tournament (frontend-compatible)
router.post('/:id/leave', tournamentController.leaveTournament);

// Get all players in tournament
router.get('/:id/players', tournamentController.getAllPlayersInTournament);

// Get all games in tournament
router.get('/:id/games', tournamentController.getAllGamesInTournament);

// Get active games in tournament
router.get('/:id/active', tournamentController.getAllActiveGamesInTournament);

module.exports = router; 
