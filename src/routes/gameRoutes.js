const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');

// Route to get a game by id
router.get('/:id', gameController.getGameById);

// Route to finish a game
router.post('/:id/submitresult', gameController.submitGameResult);
module.exports = router;
