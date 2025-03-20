const express = require('express');
const router = express.Router();
const tournamentController = require('../controllers/tournamentController');

// Create tournament
router.post('/create', tournamentController.createTournament);
router.put('/:id', tournamentController.updateTournament);

// Load arena (tournament view)
router.get('/', tournamentController.getTournaments);

// Get Standings (new route)
router.get('/:id/standings', tournamentController.getStandings);


module.exports = router;
