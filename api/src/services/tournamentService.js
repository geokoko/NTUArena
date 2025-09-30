const Tournament = require('../models/Tournament');
const Player = require('../models/Player');
const Game = require('../models/Game');
const User = require('../models/User');

class TournamentService {
	filterSettings(settings) {
		const allowed = ['name', 'tournLocation', 'startDate', 'endDate'];
		const filtered = {};
		for (const key of allowed) {
			const v = settings[key];
			if (v === null || v === undefined || v === '') {
				throw new Error(`Missing required field: ${key}`);
			}
			filtered[key] = v;
		}
		const start = new Date(filtered.startDate);
		const end = new Date(filtered.endDate);
		if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new Error('Invalid date format');
		if (start >= end) throw new Error('Start date must be before end date');
		return filtered;
	}

	async createTournament(settings) {
		const filtered = this.filterSettings(settings);
		const t = new Tournament(filtered);
		await t.save();
		return t;
	}

	async startTournament(id) {
		const t = await Tournament.findById(id);
		if (!t) throw new Error('Tournament not found');
		if (t.tournStatus !== 'upcoming') throw new Error('Tournament already started or completed');
		t.tournStatus = 'in progress';
		await t.save();
		return t;
	}

	async endTournament(id) {
		const t = await Tournament.findById(id);
		if (!t) throw new Error('Tournament not found');
		if (t.tournStatus !== 'in progress') throw new Error('Tournament not in progress');
		t.tournStatus = 'completed';
		await t.save();
		return t;
	}

	async getTournamentById(id) {
		const t = await Tournament.findById(id).populate('participants').populate('games');
		if (!t) throw new Error('Tournament not found');
		return t;
	}

	async getAllTournaments() { return await Tournament.find(); }

	async joinTournament(userId, tournamentId) {
		const t = await Tournament.findById(tournamentId);
		if (!t) throw new Error('Tournament not found');
		if (t.tournStatus !== 'upcoming') throw new Error('Tournament already started or completed');
		const exists = await Player.findOne({ user: userId, tournament: tournamentId });
		if (exists) throw new Error('User already joined the tournament');
		const user = await User.findById(userId);
		if (!user) throw new Error('User not found');
		const p = new Player({ user: userId, tournament: tournamentId, liveRating: user.globalElo || 1000 });
		await p.save();
		t.participants.push(p._id);
		t.scoreboard.push({ player: p._id, score: 0 });
		await t.save();
		return p;
	}

	async leaveTournament(userId, tournamentId) {
		const t = await Tournament.findById(tournamentId);
		if (!t) throw new Error('Tournament not found');
		const player = await Player.findOne({ user: userId, tournament: tournamentId });
		if (!player) throw new Error('Player not found in tournament');
		await Player.deleteOne({ _id: player._id });
		t.participants = t.participants.filter(id => id.toString() !== player._id.toString());
		t.scoreboard = t.scoreboard.filter(s => s.player.toString() !== player._id.toString());
		await t.save();
		return { message: 'Player left tournament successfully' };
	}

	async getAllPlayersInTournament(tournamentId) {
		return await Player.find({ tournament: tournamentId });
	}

	async getAllGamesInTournament(tournamentId) {
		return await Game.find({ tournament: tournamentId }).populate('playerWhite playerBlack');
	}

	async getAllActiveGamesInTournament(tournamentId) {
		const players = await Player.find({ tournament: tournamentId }).select('_id');
		const ids = players.map(p => p._id);
		return await Game.find({ tournament: tournamentId, isFinished: false, $or: [ { playerWhite: { $in: ids } }, { playerBlack: { $in: ids } } ] }).populate('playerWhite playerBlack');
	}

	async getTournamentStandings(tournamentId) {
		const t = await Tournament.findById(tournamentId).populate({ path: 'participants', select: 'user score liveRating gameHistory' });
		if (!t) throw new Error('Tournament not found');
		return t.participants.map(p => ({ playerId: p._id, userId: p.user, score: p.score, liveRating: p.liveRating, gamesPlayed: p.gameHistory.length })).sort((a,b)=> b.score - a.score);
	}

	// Internal: invoked after a game is finished
	async applyGameResult({ gameId, tournamentId, whitePlayerId, blackPlayerId, result }) {
		await Game.findByIdAndUpdate(gameId, { $set: { isFinished: true, finishedAt: new Date(), resultColor: result } }, { upsert: true });
		const white = await Player.findById(whitePlayerId);
		const black = await Player.findById(blackPlayerId);
		if (white && black) {
			if (result === 'white') white.score += 1;
				else if (result === 'black') black.score += 1;
					else if (result === 'draw') { white.score += 0.5; black.score += 0.5; }
			await white.save(); await black.save();
			const t = await Tournament.findById(tournamentId);
			if (t) {
				const we = t.scoreboard.find(e => e.player.toString() === white._id.toString());
				const be = t.scoreboard.find(e => e.player.toString() === black._id.toString());
				if (we) we.score = white.score; if (be) be.score = black.score;
				await t.save();
			}
		}
	}

	async addGameToTournament({ gameId, tournamentId, whitePlayerId, blackPlayerId }) {
		await Game.findByIdAndUpdate(gameId, { $setOnInsert: { playerWhite: whitePlayerId, playerBlack: blackPlayerId, tournament: tournamentId, isFinished: false } }, { upsert: true });
		await Tournament.findByIdAndUpdate(tournamentId, { $addToSet: { games: gameId } });
	}
}

module.exports = new TournamentService();

