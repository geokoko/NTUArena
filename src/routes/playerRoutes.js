const express = require('express');
const router = express.Router();
const playerController = require('../controllers/playerController');

// Player views their own stats in a specific tournament
router.get('/:userId/:tournamentId/stats', playerController.getPlayerStats);

module.exports = router;
