const express = require('express');
const router = express.Router();
const tournamentController = require('../controllers/tournamentController');

// Create tournament
router.post('/create', tournamentController.createTournament);

// Load arena (tournament view)
router.get('/:id', tournamentController.getTournamentView);

// Player actions
router.post('/:id/join', tournamentController.joinTournament);
router.post('/:id/leave', tournamentController.leaveTournament);

// Game & Progress
router.get('/:id/games', tournamentController.getOngoingGames);
router.get('/:id/standings', tournamentController.getTournamentStandings);

module.exports = router;
