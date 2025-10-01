const Tournament = require('../models/Tournament');
const Player = require('../models/Player');
const Game = require('../models/Game');
const User = require('../models/User');
const pairingService = require('./pairingService');

class TournamentService {
	filterSettings(settings) {
		const allowed = ['title', 'timeControl', 'type', 'description'];
		return Object.fromEntries(
			Object.entries(settings).filter(([key]) => allowed.includes(key))
		);
	}

	async createTournament(data) {
		const t = new Tournament(this.filterSettings(data));
		t.tournStatus = 'upcoming';
		await t.save();
		return t;
	}

	async startTournament(id) {
		const t = await Tournament.findById(id);
		if (!t) throw new Error('Tournament not found');
		if (t.tournStatus !== 'upcoming')
			throw new Error('Tournament already started or completed');

		t.tournStatus = 'in progress';
		await t.save();

		// START THE ARENA PAIRING LOGIC HERE
		pairingService.startPairingLoop(id);
		return t;
	}

	async endTournament(id) {
		const t = await Tournament.findById(id);
		if (!t) throw new Error('Tournament not found');
		if (t.tournStatus !== 'in progress')
			throw new Error('Tournament not in progress');

		t.tournStatus = 'completed';
		await t.save();

		// STOP THE ARENA PAIRING LOGIC HERE
		pairingService.stopPairingLoop(id);
		return t;
	}

	async deleteTournament(id) {
		const t = await Tournament.findById(id);
		if (!t) throw new Error('Tournament not found');
		if (t.tournStatus === 'in progress')
			throw new Error('Cannot delete an in-progress tournament; end it first.');

		await Promise.all([
			Player.deleteMany({ tournament: id }),
			Game.deleteMany({ tournament: id })
		]);
		await t.deleteOne();
		return { message: 'Tournament deleted' };
	}

	async getTournamentById(id) {
		const t = await Tournament.findById(id)
			.populate('participants')
			.populate('games');
		if (!t) throw new Error('Tournament not found');
		return t;
	}

	async joinTournament(userId, tournamentId) {
		const t = await Tournament.findById(tournamentId);
		if (!t) throw new Error('Tournament not found');
		if (t.tournStatus !== 'upcoming')
			throw new Error('Tournament already started or completed');

		const exists = await Player.findOne({ user: userId, tournament: tournamentId });
		if (exists) throw new Error('User already joined the tournament');

		const player = new Player({
			user: userId,
			tournament: tournamentId,
			isPlaying: false,
			waitingSince: new Date()
		});
		await player.save();

		t.participants.push(player._id);
		await t.save();

		return player;
	}

	async leaveTournament(userId, tournamentId) {
		const t = await Tournament.findById(tournamentId);
		if (!t) throw new Error('Tournament not found');

		const player = await Player.findOne({ user: userId, tournament: tournamentId });
		if (!player) throw new Error('Player not found in tournament');
		if (player.isPlaying) throw new Error('Player cannot leave while playing an active game');

		await Player.deleteOne({ _id: player._id });
		t.participants = t.participants.filter(
			id => id.toString() !== player._id.toString()
		);
		await t.save();

		return { message: 'Player left tournament successfully' };
	}

	async addGameToTournament({ gameId, tournamentId, whitePlayerId, blackPlayerId }) {
		await Game.findByIdAndUpdate(
			gameId,
			{
				$setOnInsert: {
					playerWhite: whitePlayerId,
					playerBlack: blackPlayerId,
					tournament: tournamentId,
					isFinished: false
				}
			},
			{ upsert: true }
		);

		await Tournament.findByIdAndUpdate(tournamentId, {
			$addToSet: { games: gameId }
		});
	}

	async adminAddPlayerToTournament(userId, tournamentId) {
		return this.joinTournament(userId, tournamentId);
	}

	async adminRemovePlayerFromTournament(userId, tournamentId) {
		return this.leaveTournament(userId, tournamentId);
	}
}

module.exports = new TournamentService();

