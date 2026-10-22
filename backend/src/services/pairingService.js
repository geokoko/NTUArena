const { PairingWorker } = require('./pairing/pairingWorker');
const { parsePairingSettleMs } = require('./pairing/pairingConfig');
const Player = require('../models/Player');
const Tournament = require('../models/Tournament');

class PairingService {
	constructor() {
		this.workers = new Map(); // tournamentId -> worker
		this.starting = new Map();
	}

	async markWaitingPlayers(tournamentId, now = new Date()) {
		// The worker reads its pool from MongoDB; recovery preserves the time
		// already spent waiting and only stamps players that have none.
		const { modifiedCount } = await Player.updateMany(
			{ tournament: tournamentId, isPlaying: false, status: 'active', waitingSince: null },
			{ $set: { waitingSince: now } },
		);
		console.log(`[pairing] Marked ${modifiedCount} non-playing players as waiting for tournament ${tournamentId}.`);
	}

	async startPairingLoop(tournamentId) {
		const key = String(tournamentId);
		if (this.workers.has(key)) return;
		if (this.starting.has(key)) return this.starting.get(key).promise;
		const state = { cancelled: false };
		this.starting.set(key, state);
		state.promise = this.startWorker(key, state);
		try {
			await state.promise;
		} finally {
			if (this.starting.get(key) === state) this.starting.delete(key);
		}
	}

	async startWorker(tournamentId, state) {
		const tournament = await Tournament.findById(tournamentId);
		if (state.cancelled || !tournament || tournament.tournStatus !== 'in progress' || tournament.pairingClosedAt) return;
		if (tournament.endDate && tournament.endDate <= new Date()) return;
		const startedAt = new Date();
		await this.markWaitingPlayers(tournamentId, startedAt);
		if (state.cancelled) return;

		// Players waiting when the worker starts are treated as settled, so the
		// first pairing round does not wait for the quiet window.
		const worker = new PairingWorker({
			workerId: `pair-${tournamentId}`, batchSize: 80, idleMs: 400,
			settleMs: parsePairingSettleMs(), settledBefore: startedAt.getTime(),
		});
		this.workers.set(tournamentId, worker);
		// The worker owns a long-running loop. Observe its failures
		// and let scheduler recovery retry instead of losing the worker silently.
		worker.start(tournamentId).then(() => {
			if (this.workers.get(tournamentId) === worker) this.workers.delete(tournamentId);
		}, (err) => {
			if (this.workers.get(tournamentId) !== worker) return;
			this.workers.delete(tournamentId);
			console.error(`[pairing] worker failed for ${tournamentId}:`, err.message);
			require('./tournamentScheduler').retryTournament(tournamentId);
		});
	}

	stopPairingLoop(tournamentId) {
		const key = String(tournamentId);
		const starting = this.starting.get(key);
		if (starting) starting.cancelled = true;
		this.workers.get(key)?.stop();
		this.workers.delete(key);
	}
}

module.exports = new PairingService();
