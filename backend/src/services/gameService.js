const mongoose = require('mongoose');
const Game = require('../models/Game');
const Player = require('../models/Player');
const User = require('../models/User');
const Tournament = require('../models/Tournament');
const { enqueue, removePlayerEverywhere } = require('./queue/redisQueue');
const playerSnapshot = require('./queue/playerSnapshot');
const { logEvent } = require('./tournamentLogger');
const {
	findByIdOrPublicId,
	ensureDocumentPublicId,
	isObjectId,
	normalizeLookupId,
} = require('../utils/identifiers');

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function asNumber(value, fallback = 0) {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

function resolveOpponentRating(opponent) {
	if (!opponent) return 0;
	return asNumber(opponent.entryRating);
}

// FIDE-style performance rating calculation
// Handles unrated players (0 rating) by using a minimum baseline of 1400
// per FIDE 2024 rating regulations for initial rating calculations
function calculatePerformanceRating({ sumOpponentRatings = 0, gamesPlayed = 0, score = 0 }) {
	const games = asNumber(gamesPlayed, 0);
	if (!games) return 0;
	const points = asNumber(score, 0);
	
	// Calculate average opponent rating
	let avgOpp = sumOpponentRatings / games;
	if (!Number.isFinite(avgOpp)) avgOpp = 0;
	
	// FIDE uses a minimum baseline of 1400 for unrated player calculations
	// If average opponent rating is below this, use the baseline
	const RATING_FLOOR = 1400;
	const effectiveAvgOpp = Math.max(avgOpp, RATING_FLOOR);

	const fraction = points / games;
	// Perfect score: performance = avgOpp + 400
	if (fraction >= 1) return Math.round(effectiveAvgOpp + 400);
	// Zero score: performance = avgOpp - 400
	if (fraction <= 0) return Math.round(Math.max(effectiveAvgOpp - 400, 0));

	// FIDE formula: Rp = Ra + 400 * log10(W/L) where W = wins, L = losses (as fractions)
	const diff = clamp(400 * Math.log10(fraction / (1 - fraction)), -400, 400);
	const performance = effectiveAvgOpp + diff;
	if (!Number.isFinite(performance)) return Math.round(effectiveAvgOpp);
	return Math.round(Math.max(performance, 0)); // Ensure non-negative
}

function applyResultToPlayer({ player, opponentRating, resultColor, perspective, gameId }) {
	if (!player) return;
	const now = new Date();
	const isWhite = perspective === 'white';
	const resultMap = {
		white: isWhite ? 1 : 0,
		black: isWhite ? 0 : 1,
		draw: 0.5,
	};

	const points = resultMap[resultColor] ?? 0;

	player.isPlaying = false;
	player.gamesPlayed = asNumber(player.gamesPlayed) + 1;
	player.score = asNumber(player.score) + points;
	player.gameHistory = [...(player.gameHistory || []), gameId].slice(-50);
	player.sumOpponentRatings = asNumber(player.sumOpponentRatings) + opponentRating;
	player.lastResultAt = now;

	if (resultColor === 'draw') {
		player.draws = asNumber(player.draws) + 1;
	} else if ((resultColor === 'white' && isWhite) || (resultColor === 'black' && !isWhite)) {
		player.wins = asNumber(player.wins) + 1;
	} else {
		player.losses = asNumber(player.losses) + 1;
	}

	player.performanceRating = calculatePerformanceRating({
		sumOpponentRatings: player.sumOpponentRatings,
		gamesPlayed: player.gamesPlayed,
		score: player.score,
	});
}

function rollbackLatestPairingHistory(player, opponentId, expectedColor) {
	if (!player) return;
	const opponents = [...(player.recentOpponents ?? [])];
	const colors = [...(player.colorHistory ?? [])];
	if (!opponents.length || !colors.length) return;

	const latestOpponent = opponents.at(-1);
	const latestColor = colors.at(-1);
	if (String(latestOpponent) !== String(opponentId) || latestColor !== expectedColor) return;

	player.recentOpponents = opponents.slice(0, -1);
	player.colorHistory = colors.slice(0, -1);
}

async function enqueueIfEligible(player, tournament) {
	if (!player || player.status !== 'active') return false;
	if (!tournament || tournament.tournStatus !== 'in progress' || tournament.pairingClosedAt) return false;
	player.waitingSince = player.waitingSince || new Date();
	await player.save();
	// A just-created game's consumed snapshot may still await worker ACK.
	// Replace that old state before idempotent enqueue of the freed player.
	await removePlayerEverywhere(String(tournament._id), player._id);
	await enqueue(String(tournament._id), playerSnapshot(player));
	return true;
}

const gameError = (message, status, code) => Object.assign(new Error(message), { status, code });

async function changeGame(gameId, changes, updatePlayers) {
	const lookupId = normalizeLookupId(gameId);
	if (!lookupId) throw gameError('Game not found', 404, 'GAME_NOT_FOUND');
	const lookupFilter = isObjectId(lookupId)
		? { $or: [{ _id: lookupId }, { publicId: lookupId }] }
		: { publicId: lookupId };
	const session = await mongoose.startSession();
	let changed;
	try {
		await session.withTransaction(async () => {
			const game = await Game.findOneAndUpdate(
				{ ...lookupFilter, isFinished: false, isCancelled: { $ne: true } },
				{ $set: changes },
				{ session, returnDocument: 'after' },
			);
			if (!game) {
				const existing = await Game.findOne(lookupFilter).select('resultColor isFinished isCancelled').session(session);
				if (!existing) throw gameError('Game not found', 404, 'GAME_NOT_FOUND');
				const message = existing.isCancelled
					? `Game with ID: ${gameId} already cancelled`
					: `Game with ID: ${gameId} already finished with result ${existing.resultColor}`;
				throw gameError(message, 409, 'GAME_ALREADY_SETTLED');
			}
			// A session cannot run parallel operations. Commit the game and both
			// player updates together so a failed save leaves the game retryable.
			const tournament = await Tournament.findById(game.tournament).session(session);
			const white = await Player.findById(game.playerWhite).session(session);
			const black = await Player.findById(game.playerBlack).session(session);
			updatePlayers({ game, tournament, white, black });
			for (const player of [white, black]) {
				if (player) await player.save({ session });
			}
			changed = { game, tournament, white, black };
		}, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
		return changed;
	} finally {
		await session.endSession();
	}
}

async function lowestFreeBoardNumber(tournamentId, session) {
	const activeGames = await Game.find({
		tournament: tournamentId,
		isFinished: false,
		isCancelled: { $ne: true },
		boardNumber: { $ne: null },
	})
		.select('boardNumber')
		.session(session)
		.lean();

	const used = new Set(activeGames.map((game) => Number(game.boardNumber)).filter(Number.isFinite));
	let boardNumber = 1;
	while (used.has(boardNumber)) boardNumber += 1;
	return boardNumber;
}

async function completeIfNoActiveGames(tournamentId) {
	const tournament = await Tournament.findById(tournamentId);
	if (!tournament || tournament.tournStatus !== 'finishing') return tournament;
	const activeGames = await Game.countDocuments({
		tournament: tournament._id,
		isFinished: false,
		isCancelled: { $ne: true },
	});
	if (activeGames > 0) return tournament;

	const completed = await Tournament.findOneAndUpdate(
		{ _id: tournamentId, tournStatus: 'finishing' },
		{ $set: { tournStatus: 'completed' } },
		{ returnDocument: 'after' },
	);
	if (!completed) return Tournament.findById(tournamentId);
	await logEvent(tournament._id, 'tournament.completed', {
		message: 'Tournament completed after all active games finished.',
		payload: { completedAt: new Date() },
	});
	return completed;
}

/**
 * Recomputes and persists the `standing` field for all players in a tournament.
 * Ranked by score DESC, then performance DESC, then entry rating DESC.
 * Called fire-and-forget after every game result so standings are always current.
 */
async function refreshStandings(tournamentId) {
	const players = await Player.find({ tournament: tournamentId })
		.select('_id score performanceRating entryRating')
		.sort({ score: -1, performanceRating: -1, entryRating: -1 })
		.lean();

	if (!players.length) return;

	const bulkOps = players.map((p, idx) => ({
		updateOne: {
			filter: { _id: p._id },
			update: { $set: { standing: idx + 1 } },
		},
	}));

	await Player.bulkWrite(bulkOps);
}

// Chain refreshes per tournament so concurrent result submissions cannot
// interleave read/write phases and overwrite newer standings with stale
// ones. Refreshes for different tournaments still run in parallel.
const standingsChains = new Map();

function scheduleStandingsRefresh(tournamentId) {
	const key = String(tournamentId);
	const prev = standingsChains.get(key) || Promise.resolve();
	const next = prev
		.catch(() => {})
		.then(() => refreshStandings(tournamentId))
		.catch((err) => console.error('[GameService] standings refresh failed:', err));
	standingsChains.set(key, next);
	next.finally(() => {
		if (standingsChains.get(key) === next) standingsChains.delete(key);
	});
	return next;
}

class GameService {
	async completeAfterGame(tournamentId) {
		try {
			await this.completeIfNoActiveGames(tournamentId);
		} catch (err) {
			console.error('[GameService] completion deferred after committed game:', err.message);
		}
	}

	async completeIfNoActiveGames(tournamentId) {
		try {
			return await completeIfNoActiveGames(tournamentId);
		} catch (err) {
			require('./tournamentScheduler').retryTournament(tournamentId);
			throw err;
		}
	}

	async getGameById(id) {
		const game = await findByIdOrPublicId(Game, id);
		if (!game) throw new Error('Game not found');
		await ensureDocumentPublicId(game, Game);
		await game.populate([
			{
				path: 'playerWhite',
				populate: { path: 'user', select: 'publicId username email globalElo profile.firstName profile.lastName' },
			},
			{
				path: 'playerBlack',
				populate: { path: 'user', select: 'publicId username email globalElo profile.firstName profile.lastName' },
			},
		]);
		if (game.playerWhite) {
			await ensureDocumentPublicId(game.playerWhite, Player);
			if (game.playerWhite.user) await ensureDocumentPublicId(game.playerWhite.user, User);
		}
		if (game.playerBlack) {
			await ensureDocumentPublicId(game.playerBlack, Player);
			if (game.playerBlack.user) await ensureDocumentPublicId(game.playerBlack.user, User);
		}
		return serializeGame(game);
	}
	/**
	 * Includes two functions:
	 * a. createGameFromPairing -> the function that creates the game when the pairing algorithm has decided a pairing
	 * b. submitGameResult		-> called by the administrator (via controller) when submitting a game result
	 */
	async createGameFromPairing(whitePlayerId, blackPlayerId, tournamentId) {
		if (String(whitePlayerId) === String(blackPlayerId)) {
			throw new Error('A game requires two distinct players');
		}
		/**
		* Called only by the pairing engine.
		* Atomically creates a game and flips both players to isPlaying=true.
		* Also updates colorHistory & recentOpponents (Player refs!) at creation time
		* so "just played together" is immediately visible to the next cycle.
		*/
		const session = await mongoose.startSession();
		let createdGame;
		try {
			await session.withTransaction(async () => {
				// Write the tournament inside the transaction so closure and
				// concurrent board allocation cannot race an in-flight pairing.
				const open = await Tournament.findOneAndUpdate(
					{ _id: tournamentId, tournStatus: 'in progress', pairingClosedAt: null,
						$or: [{ endDate: null }, { endDate: { $gt: new Date() } }] },
					{ $inc: { pairingRevision: 1 } },
					{ session, returnDocument: 'after' },
				);
				if (!open) throw new Error('Tournament pairing is closed');
				// Run reads sequentially. A ClientSession is not thread-safe, so
				// parallel ops sharing one session collide on the active transaction
				// number and yield MongoServerError 117 ConflictingOperationInProgress.
				const white = await Player.findOne({ _id: whitePlayerId, tournament: tournamentId }).session(session).exec();
				const black = await Player.findOne({ _id: blackPlayerId, tournament: tournamentId }).session(session).exec();

				// Reject paused/withdrawn players. Pairing decisions are made off
				// stale Redis snapshots taken when the player was enqueued; by the
				// time we land here, the admin may have flipped status to 'paused'
				// or 'withdrawn'. isPlaying alone does not catch that.
				const isInactive = (p) => p.status && p.status !== 'active';
				if (!white || !black || white.isPlaying || black.isPlaying || isInactive(white) || isInactive(black)) {
					throw new Error('Players unavailable (busy or inactive)');
				}

				const boardNumber = await lowestFreeBoardNumber(tournamentId, session);
				const game = new Game({
					playerWhite: whitePlayerId,
					playerBlack: blackPlayerId,
					tournament: tournamentId,
					boardNumber,
					isFinished: false,
				});

				white.isPlaying = true;
				black.isPlaying = true;

				white.colorHistory = [...(white.colorHistory || []), 'white'].slice(-10);
				black.colorHistory = [...(black.colorHistory || []), 'black'].slice(-10);

				white.recentOpponents = [...(white.recentOpponents || []), black._id].slice(-10);
				black.recentOpponents = [...(black.recentOpponents || []), white._id].slice(-10);

				white.waitingSince = null;
				black.waitingSince = null;

				white.lastCancelledOpponent = null;
				black.lastCancelledOpponent = null;

				await white.save({ session });
				await black.save({ session });
				await game.save({ session });

				createdGame = game;
			}, {
					readConcern: { level: 'snapshot' },
					writeConcern: { w: 'majority' },
				});

			return createdGame;
		} catch (err) {
			console.error('[GameService] createGameFromPairing error:', err);
			throw err;
		} finally {
			await session.endSession();
		}
	}

	/**
   * Marks game finished, applies result, frees both players, and re-enqueues them.
   */
	async submitGameResult(gameId, result) {
		// Normalize incoming result to one of: 'white' | 'black' | 'draw'
		const normalize = (r) => {
			if (!r) return null;
			const v = String(r).toLowerCase().trim();
			if (v === '1-0' || v === 'white' || v === 'w') return 'white';
			if (v === '0-1' || v === 'black' || v === 'b') return 'black';
			if (v === '1/2-1/2' || v === '0.5-0.5' || v === 'draw' || v === '½-½') return 'draw';
			return null;
		};

		const resultColor = normalize(result);
		if (!resultColor) throw new Error('Invalid result value');

		const { game, tournament, white, black } = await changeGame(
			gameId, { isFinished: true, resultColor, finishedAt: new Date() },
			({ game, tournament, white, black }) => {
				for (const [player, opponent, perspective] of [[white, black, 'white'], [black, white, 'black']]) {
					if (!player) continue;
					applyResultToPlayer({ player, opponentRating: resolveOpponentRating(opponent), resultColor, perspective, gameId: game._id });
					player.waitingSince = tournament?.tournStatus === 'in progress' && player.status === 'active' ? new Date() : null;
				}
			},
		);
		await ensureDocumentPublicId(game, Game);
		const tournamentActive = tournament?.tournStatus === 'in progress';

		// Refresh the persisted standing cache before returning. Refreshes are
		// still serialized per tournament to avoid stale concurrent writes.
		await scheduleStandingsRefresh(game.tournament);

		// Small delay before re-enqueueing to prevent instant re-pairing
		// when admin terminates multiple games quickly
		const REQUEUE_DELAY_MS = 5000;
		if (tournamentActive) setTimeout(async () => {
			try {
				const currentTournament = await Tournament.findById(game.tournament);
				if (!currentTournament || currentTournament.tournStatus !== 'in progress' || currentTournament.pairingClosedAt) return;
				if (currentTournament.endDate && currentTournament.endDate <= new Date()) return;
				for (const previous of [white, black]) {
					if (!previous) continue;
					const player = await Player.findById(previous._id);
					if (!player || player.isPlaying) continue;
					await enqueueIfEligible(player, currentTournament);
				}
			} catch (err) {
				console.error('Failed to re-enqueue players after game termination:', err);
			}
		}, REQUEUE_DELAY_MS).unref?.();

		await game.populate([
			{
				path: 'playerWhite',
				populate: { path: 'user', select: 'publicId username email globalElo profile.firstName profile.lastName' },
			},
			{
				path: 'playerBlack',
				populate: { path: 'user', select: 'publicId username email globalElo profile.firstName profile.lastName' },
			},
		]);

		if (game.playerWhite) {
			await ensureDocumentPublicId(game.playerWhite, Player);
			if (game.playerWhite.user) await ensureDocumentPublicId(game.playerWhite.user, User);
		}
		if (game.playerBlack) {
			await ensureDocumentPublicId(game.playerBlack, Player);
			if (game.playerBlack.user) await ensureDocumentPublicId(game.playerBlack.user, User);
		}

		const serialized = serializeGame(game);
		await this.completeAfterGame(game.tournament);
		return serialized;
	}

	async cancelGame(gameId, { actor = null, reason = 'manual', excludePlayerIds = [] } = {}) {
		const cancelledAt = new Date();
		const excluded = new Set(excludePlayerIds.map(String));
		const { game, tournament, white, black } = await changeGame(
			gameId, { isFinished: true, isCancelled: true, cancelledAt, finishedAt: cancelledAt },
			({ tournament, white, black }) => {
				// A cancelled game was never played, so drop it from color and
				// opponent history. A manual cancellation still blocks proposing
				// the same rejected pairing again via lastCancelledOpponent.
				if (white && black) {
					rollbackLatestPairingHistory(white, black._id, 'white');
					rollbackLatestPairingHistory(black, white._id, 'black');
					if (!['player.paused', 'player.withdrawn'].includes(reason)) {
						white.lastCancelledOpponent = black._id;
						black.lastCancelledOpponent = white._id;
					}
				}
				for (const player of [white, black]) {
					if (!player) continue;
					player.isPlaying = false;
					player.waitingSince = !excluded.has(String(player._id)) && player.status === 'active'
						&& tournament?.tournStatus === 'in progress' ? cancelledAt : null;
				}
			},
		);
		await ensureDocumentPublicId(game, Game);

		if (tournament) {
			await logEvent(tournament._id, 'game.cancelled', {
				message: `Game cancelled (${reason}).`,
				payload: {
					gameId: game.publicId || String(game._id),
					boardNumber: game.boardNumber ?? null,
					reason,
					players: [white, black].filter(Boolean).map((player) => String(player._id)),
				},
				actor,
			});
		}

		for (const player of [white, black]) {
			if (!player || excluded.has(String(player._id))) continue;
			try {
				const current = await Player.findById(player._id);
				const currentTournament = await Tournament.findById(game.tournament);
				if (current && !current.isPlaying) await enqueueIfEligible(current, currentTournament);
			} catch (err) {
				console.error('[GameService] cancelled player requeue failed:', err.message);
				require('./tournamentScheduler').retryTournament(game.tournament);
			}
		}

		await this.completeAfterGame(game.tournament);

		await game.populate([
			{
				path: 'playerWhite',
				populate: { path: 'user', select: 'publicId username email globalElo profile.firstName profile.lastName' },
			},
			{
				path: 'playerBlack',
				populate: { path: 'user', select: 'publicId username email globalElo profile.firstName profile.lastName' },
			},
		]);

		return serializeGame(game);
	}

	async cancelActiveGameForPlayer(playerOrId, tournament, options = {}) {
		const playerId = playerOrId?._id || playerOrId;
		if (!playerId) return null;

		const activeGame = await Game.findOne({
			tournament: tournament?._id || tournament,
			$or: [{ playerWhite: playerId }, { playerBlack: playerId }],
			isFinished: false,
			isCancelled: { $ne: true },
		}).select('_id publicId');

		if (!activeGame) {
			if (playerOrId && typeof playerOrId.save === 'function') {
				playerOrId.isPlaying = false;
				await playerOrId.save();
			}
			return null;
		}

		try {
			return await this.cancelGame(activeGame.publicId || activeGame._id, {
				...options,
				excludePlayerIds: [...(options.excludePlayerIds || []), playerId],
			});
		} catch (err) {
			// A concurrent result/cancel has already freed the player. Continue
			// pause/withdraw cleanup, while propagating actual storage failures.
			if (err.code === 'GAME_ALREADY_SETTLED') return null;
			throw err;
		}
	}
}

module.exports = new GameService();
const toPlain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc || {});

const buildDisplayName = (user) => {
	if (!user) return 'Unknown Player';
	const first = user?.profile?.firstName?.trim?.() || '';
	const last = user?.profile?.lastName?.trim?.() || '';
	const parts = [first, last].filter(Boolean);
	if (parts.length) return parts.join(' ');
	return user?.username || user?.email || 'Unknown Player';
};

const summarizeGamePlayer = (player) => {
	if (!player) return null;
	const base = toPlain(player);
	const user = toPlain(base.user);
	return {
		id: base.publicId || null,
		userId: user.publicId || null,
		name: buildDisplayName(user),
		username: user.username || null,
		score: base.score ?? 0,
		entryRating: base.entryRating ?? user.globalElo ?? 0,
		performanceRating: base.performanceRating ?? null,
		status: base.status || 'active',
	};
};

const serializeGame = (game) => {
	const base = toPlain(game);
	return {
		id: base.publicId || null,
		resultColor: base.resultColor || null,
		finishedAt: base.finishedAt || null,
		isFinished: !!base.isFinished,
		isCancelled: !!base.isCancelled,
		cancelledAt: base.cancelledAt || null,
		boardNumber: base.boardNumber ?? null,
		startedAt: base.createdAt || null,
		playerWhite: summarizeGamePlayer(base.playerWhite),
		playerBlack: summarizeGamePlayer(base.playerBlack),
	};
};
