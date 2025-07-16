const gameService = require('../services/gameService');

class GameController {
    async submitGameResult(req, res) {
        try {
            const { gameId } = req.params;
            const { result } = req.body;
            const game = await gameService.submitGameResult(gameId, result);
            res.status(200).json(game);
        } catch (error) {
            console.error('Error submitting game result:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async getGameById(req, res) {
        try {
            const { gameId } = req.params;
            const game = await gameService.fetchGameById(gameId);
            res.status(200).json(game);
        } catch (error) {
            console.error('Error getting game by ID:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async getGamesByTournament(req, res) {
        try {
            const { tournamentId } = req.params;
            const games = await gameService.getGamesByTournament(tournamentId);
            res.status(200).json(games);
        } catch (error) {
            console.error('Error getting games by tournament:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async getActiveGamesByTournament(req, res) {
        try {
            const { tournamentId } = req.params;
            const games = await gameService.getActiveGamesByTournament(tournamentId);
            res.status(200).json(games);
        } catch (error) {
            console.error('Error getting active games by tournament:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async getGamesByPlayer(req, res) {
        try {
            const { playerId } = req.params;
            const games = await gameService.getGamesByPlayer(playerId);
            res.status(200).json(games);
        } catch (error) {
            console.error('Error getting games by player:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new GameController(); 