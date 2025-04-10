const express = require('express');
const router = express.Router();
const tournamentController = require('../controllers/tournamentController');

// Create, start and end tournament
router.post('/', tournamentController.createTournament);
router.post('/:id/start', tournamentController.startTournament);
router.post('/:id/end', tournamentController.endTournament);

// Get tournament public info by id
router.get('/:id', tournamentController.getTournamentById);

// Get Standings & active Players & games
router.get('/:id/standings', tournamentController.getStandings);
router.get('/:id/players', tournamentController.getPlayers);
router.get('/:id/games', tournamentController.getGames);

// Public endpoint to join a tournament
router.post('/:id/join', tournamentController.joinTournament);

module.exports = router;
