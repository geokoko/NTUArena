const { PairingWorker } = require('./pairing/pairingWorker');
const { parsePairingSettleMs } = require('./pairing/pairingConfig');
const { redis, enqueueMany, removePlayersEverywhere } = require('./queue/redisQueue');
const Player = require('../models/Player');
const Tournament = require('../models/Tournament');
const playerSnapshot = require('./queue/playerSnapshot');

class PairingService {
	constructor() {
		this.workers = new Map(); // tournamentId -> worker
		this.starting = new Map();
	}

	async seedQueueOnStart(tournamentId, { enqueuedAt = Date.now() } = {}) {
		const now = new Date();
		const eligible = { tournament: tournamentId, isPlaying: false, status: 'active' };
		// Recovery preserves the time already spent waiting.
		await Player.updateMany(
			{ ...eligible, waitingSince: null },
			{ $set: { waitingSince: now } },
		);
		const players = await Player.find(eligible)
			.select('_id user tempName score entryRating performanceRating recentOpponents colorHistory waitingSince status');
		await removePlayersEverywhere(tournamentId, players.map((player) => player._id));
		await enqueueMany(tournamentId, players.map((player) => playerSnapshot(player, { enqueuedAt })));

		console.log(`[pairing] Seeded queue with ${players.length} non-playing players for tournament ${tournamentId}.`);
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
		if (redis.status !== 'ready') {
			await new Promise((resolve) => {
				const finish = () => {
					clearTimeout(timer);
					redis.off('ready', finish);
					resolve();
				};
				const timer = setTimeout(finish, 3000);
				redis.once('ready', finish);
			});
		}
		if (redis.status !== 'ready') throw new Error('Redis is not ready for pairing');
		const tournament = await Tournament.findById(tournamentId);
		if (state.cancelled || !tournament || tournament.tournStatus !== 'in progress' || tournament.pairingClosedAt) return;
		if (tournament.endDate && tournament.endDate <= new Date()) return;
		const defaultSettleMs = parsePairingSettleMs();
		const settleMs = tournament.settleMs ?? defaultSettleMs;
		await this.seedQueueOnStart(tournamentId, { enqueuedAt: Date.now() - settleMs });
		if (state.cancelled) return;

		const worker = new PairingWorker({ workerId: `pair-${tournamentId}`, batchSize: 80, idleMs: 400, settleMs: defaultSettleMs });
		this.workers.set(tournamentId, worker);
		// The worker owns a long-running loop. Observe startup/reclaim failures
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
