const Tournament = require('../models/Tournament');
const Player = require('../models/Player');
const tournamentService = require('../services/tournamentService');

exports.createTournament = async (req, res) => {
	const settings = req.body;
	try {
		const tournament = await tournamentService.createTournament(settings);
		res.status(201).json(tournament);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
};

exports.startTournament = async (req, res) => {
	const { tournamentId } = req.params;
	try {
		const tournament = await tournamentService.startTournament(tournamentId);
		res.status(200).json(tournament);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
};

exports.endTournament = async (req, res) => {
	const { tournamentId } = req.params;
	try {
		const tournament = await tournamentService.endTournament(tournamentId);
		res.status(200).json(tournament);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
};

exports.getTournamentById = async (req, res) => {
	const { tournamentId } = req.params;
	try {
		const tournament = await tournamentService.getTournamentById(tournamentId);
		res.status(200).json(tournament);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
};

exports.getTournamentStandings = async (req, res) => {
	const { tournamentId } = req.params;
	try {
		const standings = await tournamentService.getTournamentStandings(tournamentId);
		res.status(200).json(standings);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
};

exports.joinTournament = async (req, res) => {
	const { tournamentId } = req.params;
	const { userId } = req.body;
	try {
		const player = await tournamentService.joinTournament(userId, tournamentId);
		res.status(200).json(player);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
};

exports.leaveTournament = async (req, res) => {
	const { tournamentId } = req.params;
	const { userId } = req.body;
	try {
		const player = await tournamentService.leaveTournament(userId, tournamentId);
		res.status(200).json(player);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
};

exports.getAllPlayersInTournament = async (req, res) => {
	const { tournamentId } = req.params;
	try {
		const players = await tournamentService.getAllPlayersInTournament(tournamentId);
		res.status(200).json(players);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
};

exports.getAllGamesInTournament = async (req, res) => {
	const { tournamentId } = req.params;
	try {
		const games = await tournamentService.getAllGamesInTournament(tournamentId);
		res.status(200).json(games);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
};

exports.getAllActiveGamesInTournament = async (req, res) => {
	const { tournamentId } = req.params;
	try {
		const games = await tournamentService.getAllActiveGamesInTournament(tournamentId);
		res.status(200).json(games);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
};
