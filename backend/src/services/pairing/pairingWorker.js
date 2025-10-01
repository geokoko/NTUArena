const mongoose = require('mongoose');
const { enqueue, batchDequeueToPending, ackFromPending, requeueLeftovers, reclaimPending } = require('../queue/redisQueue');
const { evaluatePair } = require('./pairingScorer');

const Player = require('../../models/Player');
const Game   = require('../../models/Game');
const Tournament = require('../../models/Tournament');

class PairingWorker {
	constructor({ workerId = 'w1', batchSize = 80, idleMs = 400 } = {}) {
		this.workerId = workerId;
		this.batchSize = batchSize;
		this.idleMs = idleMs;
		this.running = false;
	}

	async start(tournamentId) {
		this.running = true;
		await reclaimPending(tournamentId, this.workerId);
		while (this.running) {
			try {
				const t = await Tournament.findById(tournamentId).select('tournStatus');
				if (!t || t.tournStatus !== 'in progress') {
					await this.#sleep(this.idleMs);
					continue;
				}
				await this.#cycle(tournamentId);
			} catch (err) {
				console.error('[PairingWorker] cycle error:', err);
				await this.#sleep(1000);
			}
		}
	}

	stop() { this.running = false; }

	async #cycle(tournamentId) {
		const batch = await batchDequeueToPending(tournamentId, this.workerId, this.batchSize);
		if (batch.length === 0) {
			await this.#sleep(this.idleMs);
			return;
		}

		// Greedy: oldest-first anchor, find best partner among remaining
		const remaining = [...batch];
		const pairedCount = { count: 0 };

		while (remaining.length >= 2) {
			const anchor = remaining[0];
			let bestIdx = -1;
			let bestEval = null;

			for (let i = 1; i < remaining.length; i++) {
				const e = evaluatePair(anchor, remaining[i]);
				if (!e.ok) continue;
				if (!bestEval || e.score > bestEval.score) {
					bestEval = e;
					bestIdx = i;
				}
			}

			if (bestIdx === -1) {
				// Couldn't pair anchor now; rotate once to give others a chance
				remaining.push(remaining.shift());
				if (remaining.length <= 3) break; // avoid tight loop when pool is tiny
				continue;
			}

			const partner = remaining[bestIdx];
			// remove partner first, then anchor
			remaining.splice(bestIdx, 1);
			remaining.shift();

			const { white, black } = bestEval.colors;

			const gameDoc = await this.#createGameAtomic(white._id, black._id, tournamentId);
			if (!gameDoc) {
				// if race or validation failed, then requeue both
				await enqueue(tournamentId, white);
				await enqueue(tournamentId, black);
				continue;
			}

			pairedCount.count += 2;
		}

		// Requeue leftovers from pending
		await requeueLeftovers(tournamentId, this.workerId, remaining);

		// Acknowledge the consumed (paired) items
		if (pairedCount.count > 0) {
			await ackFromPending(tournamentId, this.workerId, pairedCount.count);
		}

		await this.#sleep(remaining.length > 0 ? 50 : 0);
	}

	async #createGameAtomic(whiteId, blackId, tournamentId) {
		const session = await mongoose.startSession();
		session.startTransaction();
		try {
			const [pW, pB] = await Promise.all([
				Player.findOne({ _id: whiteId, tournament: tournamentId }).session(session).select('isPlaying user'),
				Player.findOne({ _id: blackId, tournament: tournamentId }).session(session).select('isPlaying user'),
			]);

			if (!pW || !pB || pW.isPlaying || pB.isPlaying) {
				await session.abortTransaction();
				session.endSession();
				return null;
			}

			pW.isPlaying = true;
			pB.isPlaying = true;

			const game = new Game({
				tournament: tournamentId,
				white: whiteId,
				black: blackId,
				startedAt: new Date(),
				status: 'ongoing',
			});

			await Promise.all([
				pW.save({ session }),
				pB.save({ session }),
				game.save({ session }),
			]);

			await session.commitTransaction();
			session.endSession();
			return game;
		} catch (err) {
			await session.abortTransaction();
			session.endSession();
			console.error('[PairingWorker] createGameAtomic error:', err);
			return null;
		}
	}

	#sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = { PairingWorker };
