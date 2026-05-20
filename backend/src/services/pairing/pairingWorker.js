const mongoose = require('mongoose');
const { enqueue, batchDequeueToPending, ackFromPending, requeueLeftovers, reclaimPending, removeSnapshotsFromPending } = require('../queue/redisQueue');
const { evaluatePair } = require('./pairingScorer');
const { DEFAULT_PAIRING_SETTLE_MS } = require('./pairingConfig');
const { selectBatchPairings } = require('./selectBatchPairings');

const gameService = require('../gameService');
const { logEvent } = require('../tournamentLogger');
const { debugPairing } = require('./pairingDebugLogger');
const Tournament = require('../../models/Tournament');
const Player = require('../../models/Player');

class PairingWorker {
	/**
	 * @param {object} opts
	 * @param {string}  opts.workerId   - unique id for this worker instance
	 * @param {number}  opts.batchSize  - max snapshots to dequeue per cycle
	 * @param {number}  opts.idleMs     - sleep between empty cycles
	 * @param {number}  opts.settleMs   - "quiet window": the worker WILL NOT pair
	 *        until this many ms have passed since the newest player entered the
	 *        queue.  This lets the admin finish inputting all game results before
	 *        a new pairing round fires, maximising the available player pool.
	 *        Set to 0 to disable.
	 */
	constructor({ workerId = 'w1', batchSize = 80, idleMs = 400, settleMs = DEFAULT_PAIRING_SETTLE_MS } = {}) {
		this.workerId = workerId;
		this.batchSize = batchSize;
		this.idleMs = idleMs;
		this.settleMs = settleMs;
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
				const t = await Tournament.findById(tournamentId).select('tournStatus pairingClosedAt');
				if (!t || t.tournStatus !== 'in progress' || t.pairingClosedAt) {
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
		const tournament = await Tournament.findById(tournamentId).select('settleMs pairingClosedAt tournStatus');
		if (!tournament || tournament.tournStatus !== 'in progress' || tournament.pairingClosedAt) {
			await this.#sleep(this.idleMs);
			return;
		}
		const settleMs = tournament.settleMs ?? this.settleMs;

		// 1. Fetch a batch from the queue
		const batch = await batchDequeueToPending(tournamentId, this.workerId, this.batchSize);
		if (batch.length === 0) {
			await this.#sleep(this.idleMs);
			return;
		}

		const ids = batch.map((item) => item?._id).filter(Boolean);
		const statusDocs = ids.length
			? await Player.find({ _id: { $in: ids } }).select('_id status').lean()
			: [];
		const statusMap = new Map(statusDocs.map((doc) => [String(doc._id), doc.status]));

		const inactiveSnapshots = batch.filter((snap) => {
			const status = statusMap.get(String(snap._id));
			return status && status !== 'active';
		});
		if (inactiveSnapshots.length) {
			await removeSnapshotsFromPending(tournamentId, this.workerId, inactiveSnapshots);
		}

		const remaining = batch.filter((snap) => {
			const status = statusMap.get(String(snap._id));
			return !status || status === 'active';
		});
		if (remaining.length === 0) {
			await this.#sleep(this.idleMs);
			return;
		}

		// WAITING FOR SETTLE WINDOW:
		// Wait until `settleMs` has elapsed since the most recently
		// enqueued player in the batch.  This ensures the admin has
		// stopped inputting results, so the full available player pool
		// is considered before any pairing decisions are made.
		if (settleMs > 0) {
			const newestEnqueue = Math.max(
				...remaining.map((s) => Number(s.enqueuedAt) || 0),
			);
			const quietElapsed = Date.now() - newestEnqueue;

			if (quietElapsed < settleMs) {
				// Pool is still "hot" – put everyone back and wait
				// for the remaining quiet gap.
				await requeueLeftovers(tournamentId, this.workerId, remaining);
				const sleepFor = settleMs - quietElapsed;
				await this.#sleep(sleepFor);
				return;
			}
		}

		// 2. Try to pair them off
		const handledSnapshots = [];
		const { pairings, leftovers, exhaustedNoLegalPairPool } = selectBatchPairings(remaining, evaluatePair);
		remaining.length = 0;
		remaining.push(...leftovers);

		if (exhaustedNoLegalPairPool && remaining.length >= 2) {
			await debugPairing(tournamentId, 'no_legal_pairings', {
				tournamentId: String(tournamentId),
				workerId: this.workerId,
				poolSize: remaining.length,
				pairingsCreated: pairings.length,
				playerIds: remaining.map((player) => String(player._id)),
			});
		}

		for (const { white, black } of pairings) {

			// 3. Create the game via GameService (atomic transaction inside)
			let gameDoc = null;
			try {
				gameDoc = await gameService.createGameFromPairing(white._id, black._id, tournamentId);
			} catch (e) {
				// fall through to requeue both below
			}

			if (!gameDoc) {
				// Pair creation failed: re-enqueue both to the main queue.
				// They also need to be removed from pending below, otherwise
				// they double-exist (in pending AND in main).
				await enqueue(tournamentId, white);
				await enqueue(tournamentId, black);
				handledSnapshots.push(white, black);
				continue;
			}

			handledSnapshots.push(white, black);
		}

		// Requeue leftovers from pending
		await requeueLeftovers(tournamentId, this.workerId, remaining);

		// Remove handled (paired or failed) snapshots from pending by payload.
		// Ack by count is wrong because pairings are not in pending-head order.
		await ackFromPending(tournamentId, this.workerId, handledSnapshots);

		if (pairings.length || remaining.length) {
			await logEvent(tournamentId, 'pairing.summary', {
				message: `Pairing batch produced ${pairings.length} game(s).`,
				payload: {
					poolSize: batch.length,
					pairsProduced: pairings.length,
					byes: remaining.length === 1
						? [{ playerId: String(remaining[0]._id), reason: 'odd-player-pool' }]
						: [],
					leftovers: remaining.map((player) => String(player._id)),
					settleMs,
					scoreState: batch.map((player) => ({
						playerId: String(player._id),
						score: player.score ?? 0,
						entryRating: player.entryRating ?? 0,
					})),
				},
			});
			await debugPairing(tournamentId, 'pairing_summary', {
				workerId: this.workerId,
				poolSize: batch.length,
				pairings: pairings.map(({ white, black }) => ({
					white: String(white._id),
					black: String(black._id),
				})),
				leftovers: remaining.map((player) => String(player._id)),
				settleMs,
			});
		}

		await this.#sleep(remaining.length > 0 ? 50 : 0);
	}

	#sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = { PairingWorker, selectBatchPairings };
