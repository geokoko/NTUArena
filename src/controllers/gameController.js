const gameService = require('../services/gameService');

exports.submitGameResult = async (req, res) => {
	const { gameId } = req.params;
	const { result } = req.body;
	try {
		const gameResult = await gameService.processGameResult(gameId, result);
		res.status(200).json(gameResult);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
};

exports.getGameById = async (req, res) => {
	const { gameId } = req.params;
	try {
		const game = await gameService.fetchGameById(gameId);
		res.status(200).json(game);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
};
