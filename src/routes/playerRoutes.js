const express = require('express');
const router = express.Router();
const playerController = require('../controllers/playerController');

// Route to get the player count
router.get('/', playerController.getPlayerCount);

// Route to get all players
router.get('/', playerController.getPlayers);

// Route to get a player by ID
router.get('/:id', playerController.getPlayerById);

// Route to add a new player
router.post('/', playerController.addPlayer);

// Route to update a player's details
router.put('/update/:id', playerController.updatePlayer);

// Route to change the playing state of a player
router.post('/changePlayingState/:id', playerController.changePlayingState);

// Route to delete a player
router.delete('/delete/:id', playerController.deletePlayer);

module.exports = router;
