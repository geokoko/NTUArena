const express = require('express');
const router = express.Router();
const playerController = require('../controllers/playerController');

router.get('/:id', playerController.getPlayerById);
// Route to get a player's stats in a specific tournament
router.get('/:id/stats', playerController.getPlayerStats);
// Route to add a new Player
router.post('/', playerController.addPlayer);
// Route to update a player's info
router.put('/:id', playerController.updatePlayer);
// Route to delete a player
router.delete('/', playerController.deletePlayer);

module.exports = router;

