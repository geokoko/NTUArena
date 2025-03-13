const Game = require('../models/Game');

const createGame = async (data) => {
    return await Game.create(data);
};

const getAllGames = async () => {
    return await Game.find().populate('playerWhite playerBlack');
};

const getGameById = async (id) => {
    return await Game.findById(id).populate('playerWhite playerBlack');
};

const updateGameResult = async (id, { resultColor, isFinished }) => {
    return await Game.findByIdAndUpdate(id, { resultColor, isFinished, finishedAt: new Date() }, { new: true });
};

module.exports = { createGame, getAllGames, getGameById, updateGameResult };

