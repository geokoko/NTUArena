const pairingService = require('../services/pairingService');

class PairingController {
	async generate(req, res) {
		try { 
			const { tournamentId } = req.params; 
			const pairings = await pairingService.generatePairings(tournamentId); 
			res.status(200).json({ pairings }); 
		}
		catch (e) { res.status(500).json({ error: e.message }); }
	}
}

module.exports = new PairingController();

