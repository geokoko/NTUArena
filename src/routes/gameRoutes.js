const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');

// Route to get all games
router.get('/', gameController.getAllGames);

// Route to get a game by id
router.get('/:id', gameController.getGameById);

// Route to create a new game
router.post('/create', gameController.createGame);

// Route to finish a game
router.post('/:id', gameController.updateGameResult);

module.exports = router;
