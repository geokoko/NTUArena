const express = require('express');
const router = express.Router();
const controller = require('../controllers/tournamentController');

router.post('/', controller.create.bind(controller));
router.get('/', controller.list.bind(controller));
router.post('/:id/start', controller.start.bind(controller));
router.post('/:id/end', controller.end.bind(controller));
router.get('/:id', controller.getById.bind(controller));
router.get('/:id/standings', controller.standings.bind(controller));
router.post('/:id/join', controller.join.bind(controller));
router.post('/:id/leave', controller.leave.bind(controller));
router.get('/:id/players', controller.players.bind(controller));
router.get('/:id/games', controller.games.bind(controller));
router.get('/:id/active', controller.active.bind(controller));

module.exports = router;

