const Player = require('../models/Player');
const Game = require('../models/Game');

const getPlayerCount = async () => {
	return await Player.countDocuments();
};

const getAllPlayers = async () => {
	return await Player.find().populate('user tournament gameHistory recentOpponents');
};

const getPlayerById = async (id) => {
	return await Player.findById(id).populate('user tournament gameHistory recentOpponents');
};

const getPlayerStats = async (id) => {
	const player = await Player.findById(id).populate('gameHistory');
	if (!player) throw new Error('Player not found');

	const totalGames = player.gameHistory.length;
	const totalWins = player.gameHistory.filter(game => 
		(game.playerWhite.equals(id) && game.resultColor === 'white') || 
		(game.playerBlack.equals(id) && game.resultColor === 'black')
	).length;
	const totalDraws = player.gameHistory.filter(game => game.resultColor === 'draw').length;
	const totalLosses = totalGames - totalWins - totalDraws;
	const winRate = totalGames > 0 ? (totalWins / totalGames) * 100 : 0;

	return { totalGames, totalWins, totalDraws, totalLosses, winRate };
};

const createPlayer = async ({ user, tournament, liveRating }) => {
	const newPlayer = new Player({ user, tournament, liveRating });
	return await newPlayer.save();
};

const updatePlayer = async (id, updateData) => {
	return await Player.findByIdAndUpdate(id, updateData, { new: true });
};

const togglePlayingState = async (id) => {
	const player = await Player.findById(id);
	if (!player) return null;

	player.isPlaying = !player.isPlaying;
	player.waitingSince = player.isPlaying ? null : Date.now();
	await player.save();
	return player;
};

const deletePlayer = async (id) => {
	const player = await Player.findById(id);
	if (!player) return null;
	await player.remove();
	return true;
};

const addRecentOpponent = async (playerId, opponentId) => {
	const player = await Player.findById(playerId);
	if (!player) throw new Error('Player not found');

	const playerCount = await Player.countDocuments();
	player.recentOpponents.push(opponentId);

	// Remove the oldest opponent if the list exceeds 4 times the player count
	if (player.recentOpponents.length > Math.floor(playerCount * 4)) {
		player.recentOpponents.shift();
	}
	await player.save();
	return { message: 'Recent opponent added successfully' };
};

module.exports = { 
	getPlayerCount, getAllPlayers, getPlayerById, getPlayerStats, 
	createPlayer, updatePlayer, togglePlayingState, deletePlayer, 
	addRecentOpponent 
};

