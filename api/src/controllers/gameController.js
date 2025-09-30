const gameService = require('../services/gameService');

class GameController {
	async createFromPairing(req, res) {
		try {
			const { whitePlayerId, blackPlayerId, tournamentId } = req.body || {};
			if (!whitePlayerId || !blackPlayerId || !tournamentId) {
				return res.status(400).json({
					error:
					'whitePlayerId, blackPlayerId and tournamentId are required',
				});
			}
			const game = await gameService.createGameFromPairing(
				whitePlayerId,
				blackPlayerId,
				tournamentId
			);
			res.status(201).json(game);
		} catch (e) {
			res.status(500).json({ error: e.message });
		}
	}

	async submitGameResult(req, res) {
		try {
			const g = await gameService.submitGameResult(
				req.params.gameId,
				req.body.result
			);
			res.status(200).json(g);
		} catch (e) {
			res
				.status(/not found/i.test(e.message) ? 404 : 400)
				.json({ error: e.message });
		}
	}

	async getGameById(req, res) {
		try {
			const g = await gameService.fetchGameById(req.params.gameId);
			res.status(200).json(g);
		} catch (e) {
			res.status(404).json({ error: e.message });
		}
	}

	async getGamesByTournament(req, res) {
		try {
			const r = await gameService.getGamesByTournament(
				req.params.tournamentId
			);
			res.status(200).json(r);
		} catch (e) {
			res.status(500).json({ error: e.message });
		}
	}

	async getActiveGamesByTournament(req, res) {
		try {
			const r = await gameService.getActiveGamesByTournament(
				req.params.tournamentId
			);
			res.status(200).json(r);
		} catch (e) {
			res.status(500).json({ error: e.message });
		}
	}

	async getGamesByPlayer(req, res) {
		try {
			const r = await gameService.getGamesByPlayer(req.params.playerId);
			res.status(200).json(r);
		} catch (e) {
			res.status(500).json({ error: e.message });
		}
	}
}

module.exports = new GameController();

