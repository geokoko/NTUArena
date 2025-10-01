const { PairingWorker } = require('./pairing/pairingWorker');
const { enqueue } = require('./queue/redisQueue');
const Player = require('../models/Player');

class PairingService {
	constructor() {
		this.workers = new Map(); // tournamentId -> worker
	}

	async seedQueueOnStart(tournamentId) {
		// Put all non-playing players into the queue (and set waitingSince)
		const now = new Date();
		const players = await Player.find({ tournament: tournamentId, isPlaying: false })
			.select('_id user score liveRating recentOpponents colorHistory waitingSince');
		await Player.updateMany(
			{ tournament: tournamentId, isPlaying: false },
			{ $set: { waitingSince: now } }
		);

		for (const p of players) {
			await enqueue(tournamentId, {
				_id: String(p._id),
				user: p.user,
				score: p.score ?? 0,
				liveRating: p.liveRating ?? 1200,
				// store as strings for fast compare in scorer
				recentOpponents: (p.recentOpponents ?? []).map(String),
				colorHistory: p.colorHistory ?? [],
				waitingSince: p.waitingSince ?? now,
				enqueuedAt: Date.now(),
			});
		}
	}

	async startPairingLoop(tournamentId) {
		if (this.workers.has(String(tournamentId))) return;
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

