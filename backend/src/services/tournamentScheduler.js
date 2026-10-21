const Tournament = require('../models/Tournament');
const pairingService = require('./pairingService');

// Node clamps longer timeouts to 1ms. Recheck distant schedules in chunks.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
const RETRY_MS = 5000;

class TournamentScheduler {
	constructor() {
		this.timers = new Map();
		this.retries = new Map();
		this.scheduling = new Map();
		this.allRetry = null;
	}

	clearTournament(tournamentId) {
		const key = String(tournamentId);
		for (const timers of [this.timers, this.retries]) {
			clearTimeout(timers.get(key));
			timers.delete(key);
		}
		this.scheduling.delete(key);
	}

	clearAll() {
		clearTimeout(this.allRetry);
		this.allRetry = null;
		for (const key of new Set([...this.timers.keys(), ...this.retries.keys(), ...this.scheduling.keys()])) {
			this.clearTournament(key);
		}
	}

	retryAll() {
		if (this.allRetry) return;
		this.allRetry = setTimeout(() => {
			this.allRetry = null;
			this.scheduleAll().catch((err) => {
				console.error('[scheduler] recovery scan failed:', err.message);
				this.retryAll();
			});
		}, RETRY_MS);
		this.allRetry.unref?.();
	}

	retryTournament(tournamentId) {
		// Settings/deadline changes must not postpone or discard recovery.
		if (!this.retries.has(String(tournamentId))) this.#schedule(tournamentId, RETRY_MS, this.retries);
	}

	#schedule(tournamentId, delay, timers = this.timers) {
		const key = String(tournamentId);
		clearTimeout(timers.get(key));
		const timer = setTimeout(async () => {
			if (timers.get(key) !== timer) return;
			timers.delete(key);
			try {
				await this.recoverTournament(key);
			} catch (err) {
				console.error(`[scheduler] recovery failed for ${key}:`, err.message);
				this.retryTournament(key);
			}
		}, Math.min(Math.max(delay, 0), MAX_TIMEOUT_MS));
		timer.unref?.();
		timers.set(key, timer);
	}

	async scheduleTournament(snapshot) {
		if (!snapshot?._id) return;
		const key = String(snapshot._id);
		const request = Symbol();
		this.scheduling.set(key, request);
		try {
			// Callers can have awaited logging after their write. Never arm from
			// that older snapshot, or let a slower read replace a newer schedule.
			const tournament = await Tournament.findById(key);
			if (this.scheduling.get(key) !== request) return;
			this.scheduling.delete(key);
			if (!tournament || tournament.tournStatus === 'completed') {
				this.clearTournament(key);
				return;
			}
			clearTimeout(this.timers.get(key));
			this.timers.delete(key);
			const deadline = tournament.tournStatus === 'upcoming'
				? tournament.scheduledStartDate
				: tournament.tournStatus === 'in progress' ? tournament.endDate : null;
			if (deadline) this.#schedule(key, new Date(deadline).getTime() - Date.now());
		} catch (err) {
			if (this.scheduling.get(key) !== request) return;
			this.scheduling.delete(key);
			console.error(`[scheduler] scheduling failed for ${key}:`, err.message);
			this.retryTournament(key);
		}
	}

	async recoverTournament(tournamentId) {
		const tournamentService = require('./tournamentService');
		let tournament = await Tournament.findById(tournamentId);
		if (!tournament) {
			this.clearTournament(tournamentId);
			return;
		}
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
		}
		clearTimeout(this.retries.get(String(tournamentId)));
		this.retries.delete(String(tournamentId));
		await this.scheduleTournament(tournament);
	}

	async scheduleAll() {
		this.clearAll();
		const tournaments = await Tournament.find({ tournStatus: { $in: ['upcoming', 'in progress', 'finishing'] } });
		for (const tournament of tournaments) {
			try {
				await this.recoverTournament(String(tournament._id));
			} catch (err) {
				console.error(`[scheduler] recovery failed for ${tournament._id}:`, err.message);
				this.retryTournament(tournament._id);
			}
		}
	}
}

module.exports = new TournamentScheduler();
module.exports.TournamentScheduler = TournamentScheduler;
