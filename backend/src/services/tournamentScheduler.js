const Tournament = require('../models/Tournament');

class TournamentScheduler {
	constructor() {
		this.timers = new Map();
	}

	clearTournament(tournamentId) {
		const key = String(tournamentId);
		const timers = this.timers.get(key) || [];
		for (const timer of timers) clearTimeout(timer);
		this.timers.delete(key);
	}

	scheduleTournament(tournament) {
		if (!tournament?._id) return;
		const key = String(tournament._id);
		this.clearTournament(key);

		const timers = [];
		if (tournament.tournStatus === 'upcoming' && tournament.scheduledStartDate) {
			const delay = Math.max(new Date(tournament.scheduledStartDate).getTime() - Date.now(), 0);
			timers.push(setTimeout(() => this.#autoStart(key), delay));
		}

		if (tournament.tournStatus === 'in progress' && tournament.endDate) {
			const delay = Math.max(new Date(tournament.endDate).getTime() - Date.now(), 0);
			timers.push(setTimeout(() => this.#autoEnd(key), delay));
		}

		if (timers.length) this.timers.set(key, timers);
	}

	async scheduleAll() {
		const tournaments = await Tournament.find({
			$or: [
				{ tournStatus: 'upcoming', scheduledStartDate: { $ne: null } },
				{ tournStatus: 'in progress', endDate: { $ne: null } },
			],
		});
		for (const tournament of tournaments) {
			this.scheduleTournament(tournament);
		}
		console.log(`[scheduler] scheduled ${tournaments.length} tournament timer set(s).`);
	}

	async #autoStart(tournamentId) {
		this.clearTournament(tournamentId);
		try {
			const tournamentService = require('./tournamentService');
			await tournamentService.startTournamentAuto(tournamentId);
		} catch (err) {
			console.error('[scheduler] auto-start failed:', err.message);
		}
	}

	async #autoEnd(tournamentId) {
		this.clearTournament(tournamentId);
		try {
			const tournamentService = require('./tournamentService');
			await tournamentService.endTournament(tournamentId, { trigger: 'auto' });
		} catch (err) {
			console.error('[scheduler] auto-end failed:', err.message);
		}
	}
}

module.exports = new TournamentScheduler();
