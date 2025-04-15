const Game = require('../models/Game');

async function submitGameResult (gameId, result) => {
	const game = await Game.findById(gameId).populate('playerWhite playerBlack');
	if (!game) {
		throw new Error('Game not found');
	}
	
	if (game.isFinished) {
		throw new Error('Game already finished');
	}

	game.isFinished = true;
	game.finishedAt = new Date();
	game.resultColor = result;
	await game.save();

	return { message: 'Game result submitted successfully', game };
}

async function fetchGameById(gameId) {
	const game = await Game.findById(gameId).populate('playerWhite playerBlack');
	if (!game) {
		throw new Error('Game not found');
	}

	return game;
}

module.exports = {
	submitGameResult,
	fetchGameById
};
