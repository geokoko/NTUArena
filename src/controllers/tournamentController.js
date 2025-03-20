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

//This function allows to create a get request and view standings
const getStandings = async (req, res) => {
	try {

		//Populate the tournament's scoreboard field
		const tournament = await Tournament.findById(req.params.id)
		.populate({
			path: 'scoreboard.player',
			select: 'user',
			populate: {
				path: 'user',
				select: 'username'	//Select only the username of the player
			}
		});

		if(!tournament) {
			return res.status(404).json({ message: 'Tournament not found'});
		}

		//This is needed initially, when the scoreboard list is empty 
		//REQUIRES: The field 'participants' has been initialised, by hand 
		if (tournament.scoreboard.length == 0) {
			tournament.scoreboard = tournament.participants.map(participant => ({
				player: participant._id,
				score: participant.score
			}));

			await tournament.save();
		}

		//Re-populate after initialisation
		await tournament.populate({
			path: 'scoreboard.player',
			select: 'user',
			populate: {
				path: 'user',
				select: 'username'
			}
		});

		//Sort scoreboard with descending order of scores
		const Scoreboard = tournament.scoreboard.sort((a, b) => b.score - a.score);

		//Create the standings list
		const standings = Scoreboard.map(entry => ({
			playerName: entry.player.user.username,
			score: entry.score
		}));

		res.status(200).json(standings);
	}
	catch (err) {
		res.status(500).json({ message: err.message});
	}
}

module.exports = { createTournament, getTournaments, getTournamentById, updateTournament, deleteTournament, getStandings };
