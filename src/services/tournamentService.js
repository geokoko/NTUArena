const Tournament = require('../models/Tournament');
const Player = require('../models/Player');
const Game = require('../models/Game');

function filterSettings(settings) {
	const allowedFields = ['name', 'tournLocation', 'startDate', 'endDate'];
	const filtered = {};

	// Check required fields first
	for (const key of allowedFields) {
		const value = settings[key];
		if (value === null || value === undefined || value === '') {
			throw new Error(`Missing required field: ${key}`);
		}
	}

	// Then filter out unwanted fields (maybe extra fields were passed)
	for (const key of allowedFields) {
		if (key in settings && settings[key] !== null && settings[key] !== undefined) {
			filtered[key] = settings[key];
		}
	}

	// Check date logic
	// Validate date logic
	const start = new Date(filtered.startDate);
	const end = new Date(filtered.endDate);
	
	if (isNaN(start.getTime()) || isNaN(end.getTime())) {
		throw new Error('Invalid date format');
	}

	if (start >= end) {
		throw new Error('Start date must be before end date');
	}

	return filtered;
}

async function createTournament(settings) {
	const filteredSettings = filterSettings(settings);
	const tournament = new Tournament(filteredSettings);
	await tournament.save();

	return tournament;
}

async function startTournament(tournamentId) {
	const tournament = await Tournament.findById(tournamentId);
	if (!tournament) {
		throw new Error('Tournament not found');
	}

	if (tournament.tournStatus !== 'upcoming') {
		throw new Error('Tournament already started or completed');
	}

	tournament.tournStatus = true;
	await tournament.save();

	return tournament;
}

async function endTournament(tournamentId) {
	const tournament = await Tournament.findById(tournamentId);
	if (!tournament) {
		throw new Error('Tournament not found');
	}

	if (tournament.tournStatus !== 'in progress') {
		throw new Error('Tournament already completed or not started');
	}

	tournament.tournStatus = 'in progress';
	await tournament.save();

	return tournament;
}

async function getTournamentById(tournamentId) {
	const tournament = await Tournament.findById(tournamentId)
		.populate('participants')
		.populate('games')
		.populate({
			path: 'scoreboard.player',
			populate: { path: 'user', select: 'username globalElo' }
		});

	if (!tournament) {
		throw new Error('Tournament not found');
	}

	return tournament;
}

async function joinTournament (userId, tournamentId) {
	const tournament = await Tournament.findById(tournamentId);
	if (!tournament) {
		throw new Error('Tournament not found');
	}

	if (tournament.tournStatus !== 'upcoming') {
		throw new Error('Tournament already started or completed');
	}

	const user = await User.findById(userId);
	if (!user) {
		throw new Error('User not found');
	}

	// check if user has already joined the tournament
	const existingPlayer = await Player.findOne({ user: userId, tournament: tournamentId });
	if (existingPlayer) {
		throw new Error('User already joined the tournament');
	}

	const newPlayer = new Player({
		user: userId,
		tournament: tournamentId,
		liveRating: user.globalElo
	});

	await newPlayer.save();

	tournament.participants.push(newPlayer._id);
	tournament.scoreboard.push({ player: newPlayer._id, score: 0 });
	await tournament.save();

	return newPlayer;
}

async function leaveTournament (userId, tournamentId) {
	const tournament = await Tournament.findById(tournamentId);
	if (!tournament) {
		throw new Error('Tournament not found');
	}

	const player = await Player.findOne({ user: userId, tournament: tournamentId });
	if (!player) {
		throw new Error('Player not found in tournament');
	}

	// Update user stats
	const newGameHistory = player.gameHistory;
	const user = await User.findById(userId);
	if (!user) {
		throw new Error('User not found');
	}

	user.gameHistory = user.gameHistory.filter(game => !newGameHistory.includes(game)); //????	

	await Player.deleteOne({ _id: player._id });

	tournament.participants = tournament.participants.filter(id => id.toString() !== player._id.toString());
    tournament.scoreboard = tournament.scoreboard.filter(scoreEntry => scoreEntry.player.toString() !== player._id.toString());
    
    await tournament.save();

    return { message: 'Player left tournament successfully' };
}

async function getAllPlayersInTournament (tournamentId) {
    const players = await Player.find({ tournament: tournamentId })
        .populate('user', 'username email globalElo');
    
    return players;
}

async function getAllGamesInTournament (tournamentId) {
    const games = await Game.find({ tournament: tournamentId })
        .populate('playerWhite playerBlack');

    return games;
}

async function getAllActiveGamesInTournament(tournamentId) {
    const players = await Player.find({ tournament: tournamentId }).select('_id');
    const playerIds = players.map(p => p._id);

    const games = await Game.find({ 
        isFinished: false,
        $or: [
            { playerWhite: { $in: playerIds } },
            { playerBlack: { $in: playerIds } }
        ]
    }).populate('playerWhite playerBlack');

    if (games.length === 0) {
        throw new Error('No active games found');
    }

    return games;
}

module.exports = {
	createTournament,
	startTournament,
	endTournament,
	getTournamentById,
	joinTournament,
	leaveTournament,
	getAllPlayersInTournament,
	getAllGamesInTournament,
	getAllActiveGamesInTournament
};
