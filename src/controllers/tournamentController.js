const Tournament = require('../models/Tournament');
const Player = require('../models/Player');
const tournamentService = require('../services/tournamentService');

const createTournament = async (req, res) => {
	try {
		const newTournament = new Tournament(req.body);
		await newTournament.save();
		res.status(201).json({ message: 'Tournament created successfully', tournament: newTournament });
	} catch (err) {
		res.status(500).json({ err: err.message });
	}
};

const getTournaments = async (req, res) => {
	try {
		const tournaments = await tournamentService.getAllTournaments();
		console.log(tournaments);
		res.status(200).json(tournaments);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

const getTournamentById = async (req, res) => {
	try {
		const tournament = await tournamentService.getTournamentById(req.params.id);
		res.status(200).json(tournament);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

const updateTournament = async (req, res) => {
	try {
		const updatedTournament = await tournamentService.updateTournament(req.params.id, req.body);
		res.status(200).json(updatedTournament);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

const deleteTournament = async (req, res) => {
	try {
		const deletedTournament = await tournamentService.deleteTournament(req.params.id);
		res.status(200).json(deletedTournament);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

module.exports = { createTournament, getTournaments, getTournamentById, updateTournament, deleteTournament };
