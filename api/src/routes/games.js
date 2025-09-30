const express = require('express');
const router = express.Router();
const controller = require('../controllers/gameController');

router.post('/createFromPairing', controller.createFromPairing.bind(controller));
router.post('/:gameId/submitResult', controller.submitGameResult.bind(controller));
router.post('/:gameId/result', controller.submitGameResult.bind(controller));
router.get('/:gameId', controller.getGameById.bind(controller));
router.get('/tournament/:tournamentId', controller.getGamesByTournament.bind(controller));
router.get('/tournament/:tournamentId/active', controller.getActiveGamesByTournament.bind(controller));
router.get('/player/:playerId', controller.getGamesByPlayer.bind(controller));

module.exports = router;

