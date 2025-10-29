// controllers/gameController.js
// always in the context of a tournament
const asyncHandler = require('../middleware/asyncHandler');
const gameService = require('../services/gameService');

exports.getGame = asyncHandler(async (req, res) => {
	try {
		const game = await gameService.getGameById(req.params.id);
		res.json(game);
	} catch (err) {
		if (err.message === 'Game not found') {
			return res.status(404).json({ error: err.message });
		}
		throw err;
	}
});

exports.submitResult = asyncHandler(async (req, res) => {
	const { result } = req.body; 
	const game = await gameService.submitGameResult(req.params.id, result);
	res.json(game);
});
