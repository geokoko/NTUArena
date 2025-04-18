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
router.get('/:id/standings', tournamentController.getTournamentStandings);
router.get('/:id/players', tournamentController.getAllPlayersInTournament);
router.get('/:id/games', tournamentController.getAllGamesInTournament);
router.get('/:id/activeGames', tournamentController.getAllActiveGamesInTournament);

// Public endpoint to join a tournament
router.post('/:id/join', tournamentController.joinTournament);
// Public endpoint to leave a tournament
router.post('/:id/leave', tournamentController.leaveTournament);

module.exports = router;
