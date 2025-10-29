const { PairingWorker } = require('./pairing/pairingWorker');
const { redis, enqueue } = require('./queue/redisQueue');
const Player = require('../models/Player');

class PairingService {
	constructor() {
		this.workers = new Map(); // tournamentId -> worker
	}

	async seedQueueOnStart(tournamentId) {
		// Put all non-playing players into the queue (and set waitingSince)
		const now = new Date();
		const players = await Player.find({
			tournament: tournamentId,
			isPlaying: false,
			status: { $nin: ['paused', 'withdrawn'] },
		})
			.select('_id user score liveRating entryRating recentOpponents colorHistory waitingSince status');
		await Player.updateMany(
			{ tournament: tournamentId, isPlaying: false, status: { $nin: ['paused', 'withdrawn'] } },
			{ $set: { waitingSince: now } }
		);

		for (const p of players) {
			await enqueue(tournamentId, {
				_id: String(p._id),
				user: p.user,
				score: p.score ?? 0,
				liveRating: p.liveRating ?? p.entryRating ?? 0,
				entryRating: p.entryRating ?? 0,
				// store as strings for fast compare in scorer
				recentOpponents: (p.recentOpponents ?? []).map(String),
				colorHistory: p.colorHistory ?? [],
				status: p.status,
				waitingSince: p.waitingSince ?? now,
				enqueuedAt: Date.now(),
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

		// seed queue with all non-playing players
		await this.seedQueueOnStart(tournamentId);

		const worker = new PairingWorker({ workerId: `pair-${tournamentId}`, batchSize: 80, idleMs: 400 });
		this.workers.set(String(tournamentId), worker);
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
