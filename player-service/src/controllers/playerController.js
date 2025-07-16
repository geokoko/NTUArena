const playerService = require('../services/playerService');

class PlayerController {
    async getPlayerStats(req, res) {
        try {
            const { userId, tournamentId } = req.params;
            const stats = await playerService.fetchPlayerStats(userId, tournamentId);
            res.status(200).json(stats);
        } catch (error) {
            console.error('Error getting player stats:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async getPlayersByTournament(req, res) {
        try {
            const { tournamentId } = req.params;
            const players = await playerService.getPlayersByTournament(tournamentId);
            res.status(200).json(players);
        } catch (error) {
            console.error('Error getting players by tournament:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async updatePlayerAfterGame(req, res) {
        try {
            const { playerId } = req.params;
            const { gameId, result } = req.body;
            const player = await playerService.updatePlayerAfterGame(playerId, gameId, result);
            res.status(200).json(player);
        } catch (error) {
            console.error('Error updating player after game:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new PlayerController(); 