const { evaluatePair } = require('./pairingScorer');
const { DEFAULT_PAIRING_SETTLE_MS } = require('./pairingConfig');
const { selectBatchPairings } = require('./selectBatchPairings');
const { PAIRING_CANDIDATE_FIELDS, toPairingCandidate } = require('./pairingCandidate');

const gameService = require('../gameService');
const { logEvent } = require('../tournamentLogger');
const { debugPairing } = require('./pairingDebugLogger');
const Tournament = require('../../models/Tournament');
const Player = require('../../models/Player');

class PairingWorker {
	/**
	 * The waiting pool is read from MongoDB on every cycle: a player is waiting
	 * when they are active and not playing. There is no separate queue to keep
	 * in sync, so pause/resume/result/cancel only need to update the Player.
	 *
	 * @param {object} opts
	 * @param {string}  opts.workerId   - unique id for this worker instance
	 * @param {number}  opts.batchSize  - max waiting players considered per cycle
	 * @param {number}  opts.idleMs     - sleep between empty cycles
	 * @param {number}  opts.settleMs   - "quiet window": the worker WILL NOT pair
	 *        until this many ms have passed since the newest player started
	 *        waiting.  This lets the admin finish inputting all game results before
	 *        a new pairing round fires, maximising the available player pool.
	 *        Set to 0 to disable.
	 * @param {number}  opts.settledBefore - epoch ms; players already waiting at
	 *        or before this time do not hold the quiet window open, so a
	 *        (re)started worker pairs the existing pool immediately.
	 */
	constructor({ workerId = 'w1', batchSize = 80, idleMs = 400, settleMs = DEFAULT_PAIRING_SETTLE_MS, settledBefore = 0 } = {}) {
		this.workerId = workerId;
		this.batchSize = batchSize;
		this.idleMs = idleMs;
		this.settleMs = settleMs;
		this.settledBefore = settledBefore;
		this.running = false;
	}

	async start(tournamentId) {
		this.running = true;
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

		// 1. Read the longest-waiting players straight from MongoDB
		const waiting = await Player.find({ tournament: tournamentId, status: 'active', isPlaying: false })
			.select(PAIRING_CANDIDATE_FIELDS)
			.sort({ waitingSince: 1, _id: 1 })
			.limit(this.batchSize)
			.lean();
		const pool = waiting.map(toPairingCandidate);
		if (pool.length < 2) {
			await this.#sleep(this.idleMs);
			return;
		}

		// WAITING FOR SETTLE WINDOW:
		// Wait until `settleMs` has elapsed since the most recent player
		// started waiting.  This ensures the admin has stopped inputting
		// results, so the full available player pool is considered before
		// any pairing decisions are made.
		if (settleMs > 0) {
			const newestArrival = Math.max(...pool.map((player) => this.#arrivedAt(player)));
			const quietElapsed = Date.now() - newestArrival;

			if (quietElapsed < settleMs) {
				// Pool is still "hot" – wait for the remaining quiet gap.
				await this.#sleep(settleMs - quietElapsed);
				return;
			}
		}

		// 2. Try to pair them off
		const createdPairings = [];
		const { pairings, leftovers, exhaustedNoLegalPairPool } = selectBatchPairings(pool, evaluatePair);
		const unpaired = [...leftovers];

		if (exhaustedNoLegalPairPool && unpaired.length >= 2) {
			await debugPairing(tournamentId, 'no_legal_pairings', {
				tournamentId: String(tournamentId),
				workerId: this.workerId,
				poolSize: unpaired.length,
				pairingsCreated: pairings.length,
				playerIds: unpaired.map((player) => String(player._id)),
			});
		}

		for (const { white, black } of pairings) {
			// 3. Create the game via GameService. Its transaction re-checks that
			// both players are still active and idle, so a pause or withdrawal
			// since the read above rejects the pairing; both players stay in
			// MongoDB as they are and the next cycle reconsiders them.
			try {
				await gameService.createGameFromPairing(white._id, black._id, tournamentId);
			} catch {
				unpaired.push(white, black);
				continue;
			}
			createdPairings.push({ white, black });
		}

		// Idle or incompatible pools do not change the audit history on every poll.
		if (createdPairings.length) {
			await logEvent(tournamentId, 'pairing.summary', {
				message: `Pairing batch produced ${createdPairings.length} game(s).`,
				payload: {
					poolSize: pool.length,
					pairsProduced: createdPairings.length,
					byes: unpaired.length === 1
						? [{ playerId: String(unpaired[0]._id), reason: 'odd-player-pool' }]
						: [],
					leftovers: unpaired.map((player) => String(player._id)),
					settleMs,
					scoreState: pool.map((player) => ({
						playerId: String(player._id),
						score: player.score ?? 0,
						entryRating: player.entryRating ?? 0,
					})),
				},
			});
			await debugPairing(tournamentId, 'pairing_summary', {
				workerId: this.workerId,
				poolSize: pool.length,
				pairings: createdPairings.map(({ white, black }) => ({
					white: String(white._id),
					black: String(black._id),
				})),
				leftovers: unpaired.map((player) => String(player._id)),
				settleMs,
			});
		}

		await this.#sleep(createdPairings.length ? (unpaired.length > 0 ? 50 : 0) : this.idleMs);
	}

	#arrivedAt(player) {
		const waitingSince = player.waitingSince ? new Date(player.waitingSince).getTime() : 0;
		return Number.isFinite(waitingSince) && waitingSince > this.settledBefore ? waitingSince : 0;
	}

	#sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = { PairingWorker, selectBatchPairings };
