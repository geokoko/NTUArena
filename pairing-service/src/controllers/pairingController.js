const pairingService = require('../services/pairingService');

class PairingController {
    async requestPairing(req, res) {
        try {
            const { tournamentId } = req.body;
            
            if (!tournamentId) {
                return res.status(400).json({ 
                    error: 'Tournament ID is required' 
                });
            }

            const pairings = await pairingService.requestPairing(tournamentId);
            res.status(200).json({ pairings });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getAvailablePlayers(req, res) {
        try {
            const players = pairingService.getAvailablePlayers();
            res.status(200).json({ players });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getPlayerCount(req, res) {
        try {
            const count = pairingService.getPlayerCount();
            res.status(200).json({ count });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async generatePairings(req, res) {
        try {
            const { tournamentId } = req.params;
            const pairings = await pairingService.generatePairings(tournamentId);
            res.status(200).json({ pairings });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new PairingController(); 