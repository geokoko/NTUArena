const Tournament = require('../models/Tournament');
const pairingService = require('./pairingService');

// Node clamps longer timeouts to 1ms. Recheck distant schedules in chunks.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
const RETRY_MS = 5000;

class TournamentScheduler {
	constructor() {
		this.timers = new Map();
	}

	clearTournament(tournamentId) {
		const key = String(tournamentId);
		clearTimeout(this.timers.get(key));
		this.timers.delete(key);
	}

	clearAll() {
		for (const key of this.timers.keys()) this.clearTournament(key);
	}

	retryTournament(tournamentId) {
		this.#schedule(tournamentId, RETRY_MS);
	}

	#schedule(tournamentId, delay) {
		const key = String(tournamentId);
		this.clearTournament(key);
		const timer = setTimeout(async () => {
			if (this.timers.get(key) !== timer) return;
			this.timers.delete(key);
			try {
				await this.recoverTournament(key);
			} catch (err) {
				console.error(`[scheduler] recovery failed for ${key}:`, err.message);
				if (!this.timers.has(key)) this.#schedule(key, RETRY_MS);
			}
		}, Math.min(Math.max(delay, 0), MAX_TIMEOUT_MS));
		timer.unref?.();
		this.timers.set(key, timer);
	}

	scheduleTournament(tournament) {
		if (!tournament?._id) return;
		this.clearTournament(tournament._id);
		const deadline = tournament.tournStatus === 'upcoming'
			? tournament.scheduledStartDate
			: tournament.tournStatus === 'in progress' ? tournament.endDate : null;
		if (deadline) this.#schedule(tournament._id, new Date(deadline).getTime() - Date.now());
	}

	async recoverTournament(tournamentId) {
		const tournamentService = require('./tournamentService');
		let tournament = await Tournament.findById(tournamentId);
		if (!tournament) return;
		if (tournament.tournStatus === 'upcoming' && tournament.scheduledStartDate && tournament.scheduledStartDate <= new Date()) {
			await tournamentService.startTournamentAuto(tournamentId);
			tournament = await Tournament.findById(tournamentId);
			if (!tournament) return;
		}
		if (tournament.tournStatus === 'in progress') {
			if (tournament.endDate && tournament.endDate <= new Date()) {
				await tournamentService.endTournament(tournamentId, { trigger: 'auto' });
				return;
			}
			await pairingService.startPairingLoop(String(tournament._id));
		}
		if (tournament.tournStatus === 'finishing') {
			await require('./gameService').completeIfNoActiveGames(tournament._id);
			return;
		}
		this.scheduleTournament(tournament);
	}

	async scheduleAll() {
		this.clearAll();
		const tournaments = await Tournament.find({ tournStatus: { $in: ['upcoming', 'in progress', 'finishing'] } });
		for (const tournament of tournaments) {
			try {
				await this.recoverTournament(String(tournament._id));
			} catch (err) {
				console.error(`[scheduler] recovery failed for ${tournament._id}:`, err.message);
				this.#schedule(tournament._id, RETRY_MS);
			}
		}
	}
}

module.exports = new TournamentScheduler();
module.exports.TournamentScheduler = TournamentScheduler;
