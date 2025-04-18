const Player = require('../models/Player');

async function fetchPlayerStats (userId, tournamentId) {
	const player = await Player.findOne({ user: userId, tournament: tournamentId }).populate('user tournament');
	if (!player) {
		throw new Error('Player not found');
	}
	return player;
}

async function updatePlayerAfterGame (playerId, gameId, gameResult) {
	const player = await Player.findById(playerId);
	if (!player) {
		throw new Error('Player not found');
	}

	if (gameResult === 'win') player.score += 1;
	else if (gameResult === 'draw') player.score += 0.5;

	player.isPlaying = false;
	player.gameHistory.push(gameId);

	await player.save();
}

module.exports = {
	fetchPlayerStats,
	updatePlayerAfterGame
};
