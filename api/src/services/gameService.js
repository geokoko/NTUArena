const Game = require('../models/Game');
const tournamentService = require('./tournamentService');

class GameService {
	async createGameFromPairing(whitePlayerId, blackPlayerId, tournamentId) {
		const game = new Game({ playerWhite: whitePlayerId, playerBlack: blackPlayerId, tournament: tournamentId });
		
		await game.save();
		
		await tournamentService.addGameToTournament({ gameId: game._id, tournamentId, whitePlayerId, blackPlayerId });
		
		return game;
	}

	async submitGameResult(gameId, result) {
		const game = await Game.findById(gameId);
		
		if (!game) throw new Error('Game not found');
		
		if (game.isFinished) throw new Error('Game already finished');
		
		if (!['white', 'black', 'draw'].includes(result)) throw new Error('Invalid result. Must be white, black, or draw');
		
		game.isFinished = true; 
		game.finishedAt = new Date(); 
		game.resultColor = result;
		await game.save();
		
		await tournamentService.applyGameResult({
			gameId: game._id,
			tournamentId: game.tournament,
			whitePlayerId: game.playerWhite,
			blackPlayerId: game.playerBlack,
			result });

		return game;
	}

	async fetchGameById(gameId) {
		const game = await Game.findById(gameId);
		
		if (!game) throw new Error('Game not found');
		
		return game;
	}

	async getGamesByTournament(tournamentId) { return await Game.find({ tournament: tournamentId }); }
	async getActiveGamesByTournament(tournamentId) { return await Game.find({ tournament: tournamentId, isFinished: false }); }
	async getGamesByPlayer(playerId) { return await Game.find({ $or: [{ playerWhite: playerId }, { playerBlack: playerId }] }); }
}

module.exports = new GameService();

