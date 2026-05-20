const { PairingWorker } = require('./pairing/pairingWorker');
const { parsePairingSettleMs } = require('./pairing/pairingConfig');
const { redis, enqueue } = require('./queue/redisQueue');
const Player = require('../models/Player');

class PairingService {
	constructor() {
		this.workers = new Map(); // tournamentId -> worker
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
		if (this.workers.has(String(tournamentId))) return;
		if (redis.status !== 'ready' && redis.status !== 'connect') {
			console.log('[pairing] waiting for Redis...');
			await new Promise(resolve => {
				const onReady = () => { 
					redis.off('ready', onReady); 
					resolve(); 
				};
				redis.once('ready', onReady);
				setTimeout(resolve, 3000); // fallback to proceed anyway
			});
		}

		const settleMs = parsePairingSettleMs();
		// seed queue with all non-playing players. The initial pool is already
		// complete, so mark it as settled instead of delaying round 1.
		await this.seedQueueOnStart(tournamentId, { enqueuedAt: Date.now() - settleMs });

		const worker = new PairingWorker({ workerId: `pair-${tournamentId}`, batchSize: 80, idleMs: 400, settleMs });
		this.workers.set(String(tournamentId), worker);
		console.log(`[pairing] Started worker for tournament ${tournamentId} with settleMs=${settleMs}.`);
		// begin worker
		worker.start(tournamentId);
	}

	stopPairingLoop(tournamentId) {
		const key = String(tournamentId);
		const worker = this.workers.get(key);
		if (!worker) return;
		// stop and delete worker
		worker.stop();
		this.workers.delete(key);
	}
}

module.exports = new PairingService();
