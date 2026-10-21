const mongoose = require('mongoose');
const { batchDequeueToPending, ackFromPending, requeueLeftovers, reclaimPending, removeSnapshotsFromPending } = require('../queue/redisQueue');
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
				const t = await Tournament.findById(tournamentId).select('tournStatus pairingClosedAt endDate settleMs');
				if (!t || t.tournStatus !== 'in progress' || t.pairingClosedAt || (t.endDate && t.endDate <= new Date())) break;
				await this.#cycle(tournamentId, t);
			} catch (err) {
				console.error('[PairingWorker] cycle error:', err);
				// wait a bit on error to avoid tight loop
				await this.#sleep(1000);
			}
		}
		this.running = false;
	}

	stop() { this.running = false; }

	async #cycle(tournamentId, tournament) {
		const settleMs = tournament.settleMs ?? this.settleMs;

		// 1. Fetch a batch from the queue
		const batch = await batchDequeueToPending(tournamentId, this.workerId, this.batchSize);
		if (batch.length === 0) {
			await this.#sleep(this.idleMs);
			return;
		}

		const ids = batch.map((item) => item?._id).filter(Boolean);
		const statusDocs = ids.length
			? await Player.find({ _id: { $in: ids }, tournament: tournamentId }).select('_id status isPlaying').lean()
			: [];
		const eligibleIds = new Set(statusDocs.filter((doc) => doc.status === 'active' && !doc.isPlaying).map((doc) => String(doc._id)));

		const inactiveSnapshots = batch.filter((snap) => !eligibleIds.has(String(snap._id)));
		if (inactiveSnapshots.length) {
			await removeSnapshotsFromPending(tournamentId, this.workerId, inactiveSnapshots);
		}

		const remaining = batch.filter((snap) => eligibleIds.has(String(snap._id)));
		// Recovery or a delayed result callback may duplicate a snapshot. Keep
		// one pending entry per player so matching cannot pair them with themself.
		const seen = new Set();
		const duplicates = [];
		const unique = remaining.filter((snap) => {
			const id = String(snap._id);
			if (seen.has(id)) { duplicates.push(snap); return false; }
			seen.add(id);
			return true;
		});
		await ackFromPending(tournamentId, this.workerId, duplicates);
		remaining.length = 0;
		remaining.push(...unique);
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
		const createdPairings = [];
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
				// Move failed pairings out of pending atomically. Idempotent
				// enqueue skips pending entries and cannot be used for this move.
				await requeueLeftovers(tournamentId, this.workerId, [white, black]);
				handledSnapshots.push(white, black);
				continue;
			}

			createdPairings.push({ white, black });
			handledSnapshots.push(white, black);
		}

		// Requeue leftovers from pending
		await requeueLeftovers(tournamentId, this.workerId, remaining);

		// Remove handled (paired or failed) snapshots from pending by payload.
		// Ack by count is wrong because pairings are not in pending-head order.
		await ackFromPending(tournamentId, this.workerId, handledSnapshots);

		// Idle or incompatible pools do not change the audit history on every poll.
		if (createdPairings.length) {
			await logEvent(tournamentId, 'pairing.summary', {
				message: `Pairing batch produced ${createdPairings.length} game(s).`,
				payload: {
					poolSize: batch.length,
					pairsProduced: createdPairings.length,
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
				pairings: createdPairings.map(({ white, black }) => ({
					white: String(white._id),
					black: String(black._id),
				})),
				leftovers: remaining.map((player) => String(player._id)),
				settleMs,
			});
		}

		await this.#sleep(createdPairings.length ? (remaining.length > 0 ? 50 : 0) : this.idleMs);
	}

	#sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = { PairingWorker, selectBatchPairings };
