const playerService = require('../services/playerService');

exports.getPlayerStats = async (req, res) => {
	const { userId, tournamentId } = req.params;
	try {
		const playerStats = await playerService.fetchPlayerStats(userId, tournamentId);
		res.status(200).json(playerStats);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
};
