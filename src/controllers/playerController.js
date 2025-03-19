const playerService = require('../services/playerService');

const getPlayerCount = async (req, res) => {  
	try {
		const count = await playerService.getPlayerCount();
		res.status(200).json({ count });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

const getPlayers = async (req, res) => {
	try {
		const players = await playerService.getAllPlayers();
		res.status(200).json({ players });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

const getPlayerById = async (req, res) => {
	try {
		const player = await playerService.getPlayerById(req.params.id);
		if (!player) return res.status(404).json({ message: 'Player not found' });
		res.status(200).json({ player });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

const getPlayerStats = async (req, res) => {
	try {
		const stats = await playerService.getPlayerStats(req.params.id);
		res.json(stats);
	} catch (error) {
		res.status(500).json({ error: 'Internal server error' });
	}
};

const addPlayer = async (req, res) => {
	try {
		const player = await playerService.createPlayer(req.body);
		await player.save();
		res.status(201).json({ player });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

const updatePlayer = async (req, res) => {
	try {
		const updatedPlayer = await playerService.updatePlayer(req.params.id, req.body);
		if (!updatedPlayer) return res.status(404).json({ message: 'Player not found' });
		res.status(200).json({ player: updatedPlayer });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

const changePlayingState = async (req, res) => {
	try {
		const updatedPlayer = await playerService.togglePlayingState(req.body.playerID);
		if (!updatedPlayer) return res.status(404).json({ message: 'Player not found' });
		res.status(200).json({ player: updatedPlayer });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

const deletePlayer = async (req, res) => {
	try {
		const deleted = await playerService.deletePlayer(req.body.playerID);
		if (!deleted) return res.status(404).json({ message: 'Player not found' });
		res.status(200).json({ message: 'Player removed' });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

const addRecentOpponent = async (req, res) => {
	try {
		const response = await playerService.addRecentOpponent(req.body.playerId, req.body.opponentId);
		res.json(response);
	} catch (error) {
		res.status(500).json({ error: 'Internal server error' });
	}
};

module.exports = { 
	getPlayerCount, getPlayers, getPlayerById, getPlayerStats, 
	addPlayer, updatePlayer, changePlayingState, deletePlayer, 
	addRecentOpponent 
};

