const Game = require('../models/Game');
const Player = require('../models/Player');
const tournamentService = require('./tournamentService');

class GameService {
	/**
	 * Called only by the pairing engine.
	 * Creates a game, attaches it to the tournament and updates player state.
	 */
	async createGameFromPairing(whitePlayerId, blackPlayerId, tournamentId) {
		const game = new Game({
			playerWhite: whitePlayerId,
			playerBlack: blackPlayerId,
			tournament: tournamentId,
			isFinished: false
		});
		await game.save();

		// Attach game to tournament
		await tournamentService.addGameToTournament({
			gameId: game._id,
			tournamentId,
			whitePlayerId,
			blackPlayerId
		});

		// Update players
		const [white, black] = await Promise.all([
			Player.findById(whitePlayerId),
			Player.findById(blackPlayerId)
		]);

		if (white && black) {
			white.isPlaying = true;
			black.isPlaying = true;

			white.colorHistory = [...(white.colorHistory || []), 'white'].slice(-10);
			black.colorHistory = [...(black.colorHistory || []), 'black'].slice(-10);

			white.recentOpponents = [...(white.recentOpponents || []), black.user].slice(-10);
			black.recentOpponents = [...(black.recentOpponents || []), white.user].slice(-10);

			white.gameHistory = [...(white.gameHistory || []), game._id];
			black.gameHistory = [...(black.gameHistory || []), game._id];

			white.waitingSince = null;
			black.waitingSince = null;

			await Promise.all([white.save(), black.save()]);
		}

		return game;
	}

	async submitGameResult(gameId, result) {
		const game = await Game.findById(gameId);
		if (!game) throw new Error('Game not found');
		if (game.isFinished) throw new Error('Game already finished');

		game.result = result;
		game.isFinished = true;
		await game.save();

		await tournamentService.applyGameResult({
			gameId: game._id,
			tournamentId: game.tournament,
			whitePlayerId: game.playerWhite,
			blackPlayerId: game.playerBlack,
			result
		});

		// Free both players
		const [white, black] = await Promise.all([
			Player.findById(game.playerWhite),
			Player.findById(game.playerBlack)
		]);
		const now = new Date();
		if (white) {
			white.isPlaying = false;
			white.waitingSince = now;
			await white.save();
		}
		if (black) {
			black.isPlaying = false;
			black.waitingSince = now;
			await black.save();
		}

		return game;
	}
}

module.exports = new GameService();


