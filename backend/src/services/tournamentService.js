const Tournament = require('../models/Tournament');
const Player = require('../models/Player');
const Game = require('../models/Game');
const User = require('../models/User');
const pairingService = require('./pairingService');

const makeError = (message, status = 400) => {
	const err = new Error(message);
	err.status = status;
	return err;
};

const toId = (value) => (value ? String(value) : null);

const normalizeUser = (user) => {
	if (!user) return {};
	if (typeof user.toObject === 'function') return user.toObject();
	return user;
};

const summarizePlayer = (player) => {
	if (!player) return null;
	const base = typeof player.toObject === 'function' ? player.toObject() : player;
	const user = normalizeUser(base.user);
	const gamesPlayed = Array.isArray(base.gameHistory) ? base.gameHistory.length : 0;

	return {
		id: toId(base._id),
		userId: toId(user?._id || user),
		username: user?.username || user?.email || 'Unknown Player',
		score: base.score ?? 0,
		liveRating: base.liveRating ?? user?.globalElo ?? 1200,
		isPlaying: !!base.isPlaying,
		waitingSince: base.waitingSince ?? null,
		games: gamesPlayed,
	};
};

class TournamentService {
	filterSettings(settings = {}) {
		const allowed = ['name', 'tournLocation', 'startDate', 'endDate', 'timeControl', 'description', 'type', 'maxPlayers'];
		const filtered = {};
		for (const [key, value] of Object.entries(settings)) {
			if (value === undefined) continue;
			if (key === 'title' && settings.name === undefined) {
				filtered.name = value;
				continue;
			}
			if (allowed.includes(key)) {
				filtered[key] = value;
			}
		}

		if (filtered.maxPlayers !== undefined) {
			const parsed = Number(filtered.maxPlayers);
			if (!Number.isFinite(parsed) || parsed <= 0) {
				throw makeError('maxPlayers must be a positive number');
			}
			filtered.maxPlayers = parsed;
		}

		return filtered;
	}

	async getAllTournaments() {
		const tournaments = await Tournament.find().sort({ startDate: 1 }).lean();
		return tournaments.map((t) => ({
			...t,
			name: t.name || t.title || 'Untitled Tournament',
			participants: Array.isArray(t.participants) ? t.participants : [],
			maxPlayers: t.maxPlayers ?? 100,
		}));
	}

	async createTournament(data) {
		const filtered = this.filterSettings(data);

		if (!filtered.name) throw makeError('Tournament name is required');
		if (!filtered.startDate || !filtered.endDate) {
			throw makeError('Tournament startDate and endDate are required');
		}

		const startDate = new Date(filtered.startDate);
		const endDate = new Date(filtered.endDate);
		if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
			throw makeError('Invalid startDate or endDate');
		}
		if (startDate > endDate) {
			throw makeError('startDate must be before endDate');
		}

		const tournament = new Tournament({
			...filtered,
			startDate,
			endDate,
			maxPlayers: filtered.maxPlayers ?? 100,
			tournStatus: 'upcoming',
		});

		await tournament.save();
		return tournament;
	}

	async updateTournament(id, data) {
		const filtered = this.filterSettings(data);
		if (Object.keys(filtered).length === 0) {
			throw makeError('No valid fields provided to update');
		}

		const tournament = await Tournament.findById(id);
		if (!tournament) throw makeError('Tournament not found', 404);

		if (
			filtered.maxPlayers !== undefined &&
			filtered.maxPlayers < tournament.participants.length
		) {
			throw makeError('maxPlayers cannot be lower than the current participants count');
		}

		if (filtered.startDate) {
			const parsedStart = new Date(filtered.startDate);
			if (Number.isNaN(parsedStart.getTime())) {
				throw makeError('Invalid startDate');
			}
			filtered.startDate = parsedStart;
		}
		if (filtered.endDate) {
			const parsedEnd = new Date(filtered.endDate);
			if (Number.isNaN(parsedEnd.getTime())) {
				throw makeError('Invalid endDate');
			}
			filtered.endDate = parsedEnd;
		}

		const startDate = filtered.startDate ?? tournament.startDate;
		const endDate = filtered.endDate ?? tournament.endDate;
		if (startDate && endDate && startDate > endDate) {
			throw makeError('startDate must be before endDate');
		}

		Object.assign(tournament, filtered);
		await tournament.save();
		return tournament;
	}

	async getTournamentById(id) {
		const tournament = await Tournament.findById(id)
			.populate({
				path: 'participants',
				populate: { path: 'user', select: 'username email globalElo' },
			})
			.lean();

		if (!tournament) throw makeError('Tournament not found', 404);

		const games = await this.getTournamentGames(id);

		return {
			...tournament,
			name: tournament.name || tournament.title || 'Untitled Tournament',
			participants: Array.isArray(tournament.participants)
				? tournament.participants.map(summarizePlayer)
				: [],
			games,
			maxPlayers: tournament.maxPlayers ?? 100,
		};
	}

	async getTournamentPlayers(tournamentId) {
		const players = await Player.find({ tournament: tournamentId })
			.populate('user', 'username email globalElo')
			.sort({ score: -1, liveRating: -1 })
			.lean();

		return players.map(summarizePlayer);
	}

	async getTournamentGames(tournamentId) {
		const games = await Game.find({ tournament: tournamentId })
			.sort({ createdAt: -1 })
			.populate({
				path: 'playerWhite',
				populate: { path: 'user', select: 'username email globalElo' },
			})
			.populate({
				path: 'playerBlack',
				populate: { path: 'user', select: 'username email globalElo' },
			})
			.lean();

		return games.map((game) => ({
			_id: toId(game._id),
			tournament: toId(game.tournament),
			createdAt: game.createdAt,
			finishedAt: game.finishedAt || null,
			isFinished: !!game.isFinished,
			resultColor: game.resultColor || null,
			playerWhite: summarizePlayer(game.playerWhite),
			playerBlack: summarizePlayer(game.playerBlack),
		}));
	}

	async getTournamentStandings(tournamentId) {
		const players = await Player.find({ tournament: tournamentId })
			.populate('user', 'username email globalElo')
			.lean();

		players.sort((a, b) => {
			const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
			if (scoreDiff !== 0) return scoreDiff;
			return (b.liveRating ?? 0) - (a.liveRating ?? 0);
		});

		return players.map((player, index) => {
			const summary = summarizePlayer(player);
			return {
				rank: index + 1,
				player: {
					id: summary?.id,
					username: summary?.username,
					userId: summary?.userId,
				},
				score: summary?.score ?? 0,
				games: summary?.games ?? 0,
				liveRating: summary?.liveRating ?? 0,
			};
		});
	}

	async startTournament(id) {
		const tournament = await Tournament.findById(id);
		if (!tournament) throw makeError('Tournament not found', 404);
		if (tournament.tournStatus !== 'upcoming') {
			throw makeError('Tournament already started or completed');
		}

		tournament.tournStatus = 'in progress';
		await tournament.save();

		pairingService.startPairingLoop(id);
		return tournament;
	}

	async endTournament(id) {
		const tournament = await Tournament.findById(id);
		if (!tournament) throw makeError('Tournament not found', 404);
		if (tournament.tournStatus !== 'in progress') {
			throw makeError('Tournament not in progress');
		}

		tournament.tournStatus = 'completed';
		await tournament.save();

		pairingService.stopPairingLoop(id);
		return tournament;
	}

	async deleteTournament(id) {
		const tournament = await Tournament.findById(id);
		if (!tournament) throw makeError('Tournament not found', 404);
		if (tournament.tournStatus === 'in progress') {
			throw makeError('Cannot delete an in-progress tournament; end it first.');
		}

		await Promise.all([
			Player.deleteMany({ tournament: id }),
			Game.deleteMany({ tournament: id }),
		]);
		await tournament.deleteOne();
		return { message: 'Tournament deleted' };
	}

	async joinTournament(userId, tournamentId) {
		const [tournament, user] = await Promise.all([
			Tournament.findById(tournamentId),
			User.findById(userId),
		]);

		if (!tournament) throw makeError('Tournament not found', 404);
		if (!user) throw makeError('User not found', 404);

		if (tournament.tournStatus !== 'upcoming') {
			throw makeError('Tournament already started or completed');
		}

		if (
			typeof tournament.maxPlayers === 'number' &&
			tournament.maxPlayers > 0 &&
			tournament.participants.length >= tournament.maxPlayers
		) {
			throw makeError('Tournament is full');
		}

		const exists = await Player.findOne({ user: userId, tournament: tournamentId });
		if (exists) throw makeError('User already joined the tournament');

		const player = new Player({
			user: userId,
			tournament: tournamentId,
			isPlaying: false,
			waitingSince: new Date(),
			liveRating: user.globalElo ?? 1200,
			score: 0,
		});
		await player.save();

		tournament.participants.push(player._id);
		await tournament.save();

		return player;
	}

	async leaveTournament(userId, tournamentId) {
		const tournament = await Tournament.findById(tournamentId);
		if (!tournament) throw makeError('Tournament not found', 404);

		const player = await Player.findOne({ user: userId, tournament: tournamentId });
		if (!player) throw makeError('Player not found in tournament', 404);
		if (player.isPlaying) {
			throw makeError('Player cannot leave while playing an active game');
		}

		await Player.deleteOne({ _id: player._id });
		tournament.participants = tournament.participants.filter(
			(id) => id.toString() !== player._id.toString()
		);
		await tournament.save();

		return { message: 'Player left tournament successfully' };
	}

	async adminAddPlayerToTournament(userId, tournamentId) {
		return this.joinTournament(userId, tournamentId);
	}

	async adminRemovePlayerFromTournament(userId, tournamentId) {
		return this.leaveTournament(userId, tournamentId);
	}
}

module.exports = new TournamentService();
