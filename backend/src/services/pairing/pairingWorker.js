const mongoose = require('mongoose');
const { enqueue, batchDequeueToPending, ackFromPending, requeueLeftovers, reclaimPending } = require('../queue/redisQueue');
const { evaluatePair } = require('./pairingScorer');

const gameService = require('../gameService');
const Tournament = require('../../models/Tournament');
const Player = require('../../models/Player');

class PairingWorker {
	constructor({ workerId = 'w1', batchSize = 80, idleMs = 400 } = {}) {
		this.workerId = workerId;
		this.batchSize = batchSize;
		this.idleMs = idleMs;
		this.running = false;
	}

	async start(tournamentId) {
		this.running = true;
		// Reclaim any pending items from previous crashed worker
		// to avoid "stuck" players in limbo
		await reclaimPending(tournamentId, this.workerId);
		// Main loop
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
				// wait a bit on error to avoid tight loop
				await this.#sleep(1000);
			}
		}
	}

	stop() { this.running = false; }

	async #cycle(tournamentId) {
		// 1. Fetch a batch from the queue
		const batch = await batchDequeueToPending(tournamentId, this.workerId, this.batchSize);
		if (batch.length === 0) {
			await this.#sleep(this.idleMs);
			return;
		}

		// 2. Try to pair them off
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
			// remove partner (higher index) first, then anchor (index 0, intitial player pick)
			remaining.splice(bestIdx, 1);
			remaining.shift();

			const { white, black } = bestEval.colors;

			// 3) Create the game via GameService (atomic transaction inside)
			let gameDoc = null;
			try {
				gameDoc = await gameService.createGameFromPairing(white._id, black._id, tournamentId);
			} catch (e) {
				// fall through to requeue both below
			}

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

	#sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = { PairingWorker };
