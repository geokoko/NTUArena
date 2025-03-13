const Tournament = require('../models/Tournament');

const createTournament = async (data) => {
    return await Tournament.create(data);
};

const getAllTournaments = async () => {
    return await Tournament.find().populate('participants games');
};

const getTournamentById = async (id) => {
    return await Tournament.findById(id).populate('participants games');
};

const updateTournament = async (id, updateData) => {
    return await Tournament.findByIdAndUpdate(id, updateData, { new: true });
};

const deleteTournament = async (id) => {
    const tournament = await Tournament.findById(id);
    if (!tournament) return null;
    await tournament.remove();
    return true;
};

module.exports = { createTournament, getAllTournaments, getTournamentById, updateTournament, deleteTournament };

