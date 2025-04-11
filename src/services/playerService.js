const Player = require('../models/Player');

exports.fetchPlayerStats = async (userId, tournamentId) => {
	const player = await Player.findOne({ user: userId, tournament: tournamentId }).populate('user tournament');
	if (!player) {
		throw new Error('Player not found');
	}
	return player;
};

