const express = require('express');
const router = express.Router();
const playerController = require('../controllers/playerController');

router.get('/count', playerController.getPlayerCount);
router.get('/', playerController.getPlayers);
router.get('/:id', playerController.getPlayerById);
router.get('/:id/stats', playerController.getPlayerStats);

router.post('/', playerController.addPlayer);
router.put('/:id', playerController.updatePlayer);
router.put('/toggle-playing', playerController.changePlayingState);

router.delete('/', playerController.deletePlayer);
router.post('/recent-opponent', playerController.addRecentOpponent);

module.exports = router;

