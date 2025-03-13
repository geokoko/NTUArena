const gameService = require('../services/gameService');

const createGame = async (req, res) => {
    try {
        const game = await gameService.createGame(req.body);
        res.status(201).json({ game });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const getAllGames = async (req, res) => {
    try {
        const games = await gameService.getAllGames();
        res.status(200).json({ games });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const getGameById = async (req, res) => {
    try {
        const game = await gameService.getGameById(req.params.id);
        if (!game) return res.status(404).json({ message: 'Game not found' });
        res.status(200).json({ game });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const updateGameResult = async (req, res) => {
    try {
        const updatedGame = await gameService.updateGameResult(req.params.id, req.body);
        res.status(200).json({ game: updatedGame });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = { createGame, getAllGames, getGameById, updateGameResult };

