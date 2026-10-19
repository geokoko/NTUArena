const { PairingWorker } = require('./pairing/pairingWorker');
const { parsePairingSettleMs } = require('./pairing/pairingConfig');
const { redis, enqueue, removePlayerEverywhere } = require('./queue/redisQueue');
const Player = require('../models/Player');
const Tournament = require('../models/Tournament');

class PairingService {
	constructor() {
		this.workers = new Map(); // tournamentId -> worker
		this.starting = new Map();
	}

	async seedQueueOnStart(tournamentId, { enqueuedAt = Date.now() } = {}) {
		// Put all non-playing players into the queue (and set waitingSince)
		const now = new Date();
		const players = await Player.find({
			tournament: tournamentId,
			isPlaying: false,
			status: { $nin: ['paused', 'withdrawn'] },
		})
			.select('_id user score entryRating performanceRating recentOpponents colorHistory waitingSince status');
		await Player.updateMany(
			{ tournament: tournamentId, isPlaying: false, status: { $nin: ['paused', 'withdrawn'] } },
			{ $set: { waitingSince: now } }
		);

		for (const p of players) {
			await removePlayerEverywhere(tournamentId, p._id);
			await enqueue(tournamentId, {
				_id: String(p._id),
				user: p.user,
				score: p.score ?? 0,
				entryRating: p.entryRating ?? 0,
				performanceRating: p.performanceRating ?? null,
				// store as strings for fast compare in scorer
				recentOpponents: (p.recentOpponents ?? []).map(String),
				colorHistory: p.colorHistory ?? [],
				status: p.status,
				waitingSince: p.waitingSince ?? now,
				enqueuedAt,
			});
		}

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
