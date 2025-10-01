// controllers/gameController.js
// always in the context of a tournament
const asyncHandler = require('../middleware/asyncHandler');
const Game = require('../models/Game');
const gameService = require('../services/gameService');

exports.getGame = asyncHandler(async (req, res) => {
	const game = await Game.findById(req.params.id);
	if (!game) return res.status(404).json({ error: 'Game not found' });
	res.json(game);
});

exports.submitResult = asyncHandler(async (req, res) => {
	const { result } = req.body; 
	const game = await gameService.submitGameResult(req.params.id, result);
	res.json(game);
});

