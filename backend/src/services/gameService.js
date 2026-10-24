const mongoose = require('mongoose');
const Game = require('../models/Game');
const Player = require('../models/Player');
const User = require('../models/User');
const Tournament = require('../models/Tournament');
const { logEvent } = require('./tournamentLogger');
const {
	findByIdOrPublicId,
	ensureDocumentPublicId,
	isObjectId,
	normalizeLookupId,
} = require('../utils/identifiers');
const { buildDisplayName } = require('../utils/displayName');

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

// Normalize incoming result to one of: 'white' | 'black' | 'draw'
function normalizeResult(result) {
	if (!result) return null;
	const v = String(result).toLowerCase().trim();
	if (v === '1-0' || v === 'white' || v === 'w') return 'white';
	if (v === '0-1' || v === 'black' || v === 'b') return 'black';
	if (v === '1/2-1/2' || v === '0.5-0.5' || v === 'draw' || v === '½-½') return 'draw';
	return null;
}

const RESULT_SCORES = { white: '1-0', black: '0-1', draw: '½-½' };

const OUTCOMES = {
	win: { points: 1, counter: 'wins' },
	draw: { points: 0.5, counter: 'draws' },
	loss: { points: 0, counter: 'losses' },
};

function outcomeFor(resultColor, perspective) {
	if (resultColor === 'draw') return OUTCOMES.draw;
	return resultColor === perspective ? OUTCOMES.win : OUTCOMES.loss;
}

function refreshPerformanceRating(player) {
	player.performanceRating = calculatePerformanceRating({
		sumOpponentRatings: player.sumOpponentRatings,
		gamesPlayed: player.gamesPlayed,
		score: player.score,
	});
}

function applyResultToPlayer({ player, opponentRating, resultColor, perspective, gameId }) {
	if (!player) return;
	const outcome = outcomeFor(resultColor, perspective);

	player.isPlaying = false;
	player.gamesPlayed = asNumber(player.gamesPlayed) + 1;
	player.score = asNumber(player.score) + outcome.points;
	player[outcome.counter] = asNumber(player[outcome.counter]) + 1;
	player.gameHistory = [...(player.gameHistory || []), gameId].slice(-50);
	player.sumOpponentRatings = asNumber(player.sumOpponentRatings) + opponentRating;
	player.lastResultAt = new Date();
	refreshPerformanceRating(player);
}

// Swaps a recorded outcome for another. The game still counts once with the
// same opponent rating, and the player's current game and waiting state are
// left alone: a correction must not pull anyone out of a newer pairing.
function replaceResultForPlayer({ player, previousColor, resultColor, perspective }) {
	if (!player) return;
	const previous = outcomeFor(previousColor, perspective);
	const next = outcomeFor(resultColor, perspective);

	player.score = asNumber(player.score) - previous.points + next.points;
	player[previous.counter] = Math.max(asNumber(player[previous.counter]) - 1, 0);
	player[next.counter] = asNumber(player[next.counter]) + 1;
	refreshPerformanceRating(player);
}

// Inverse of applyResultToPlayer for a game that turns out to be still in
// play: the player is back in it and the game no longer counts.
function withdrawResultFromPlayer({ player, opponentRating, resultColor, perspective, gameId, lastResultAt }) {
	const outcome = outcomeFor(resultColor, perspective);

	player.isPlaying = true;
	player.waitingSince = null;
	player.gamesPlayed = Math.max(asNumber(player.gamesPlayed) - 1, 0);
	player.score = asNumber(player.score) - outcome.points;
	player[outcome.counter] = Math.max(asNumber(player[outcome.counter]) - 1, 0);
	player.gameHistory = (player.gameHistory || []).filter((id) => String(id) !== String(gameId));
	player.sumOpponentRatings = Math.max(asNumber(player.sumOpponentRatings) - opponentRating, 0);
	player.lastResultAt = lastResultAt;
	if (player.gamesPlayed > 0) refreshPerformanceRating(player);
	else player.performanceRating = null;
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

const gameError = (message, status, code) => Object.assign(new Error(message), { status, code });

const GAME_PLAYER_USER_FIELDS = 'publicId username email globalElo profile.firstName profile.lastName';

async function populateGamePlayers(game) {
	await game.populate(['playerWhite', 'playerBlack'].map((path) => ({
		path,
		populate: { path: 'user', select: GAME_PLAYER_USER_FIELDS },
	})));
	for (const player of [game.playerWhite, game.playerBlack]) {
		if (!player) continue;
		await ensureDocumentPublicId(player, Player);
		if (player.user) await ensureDocumentPublicId(player.user, User);
	}
	return game;
}

function gameLookupFilter(gameId) {
	const lookupId = normalizeLookupId(gameId);
	if (!lookupId) throw gameError('Game not found', 404, 'GAME_NOT_FOUND');
	return isObjectId(lookupId)
		? { $or: [{ _id: lookupId }, { publicId: lookupId }] }
		: { publicId: lookupId };
}

async function inTransaction(work) {
	const session = await mongoose.startSession();
	try {
		let outcome;
		await session.withTransaction(async () => {
			outcome = await work(session);
		}, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
		return outcome;
	} finally {
		await session.endSession();
	}
}

// A session cannot run parallel operations, so these reads stay sequential.
async function loadGameContext(game, session) {
	const tournament = await Tournament.findById(game.tournament).session(session);
	const white = await Player.findById(game.playerWhite).session(session);
	const black = await Player.findById(game.playerBlack).session(session);
	return { game, tournament, white, black };
}

async function changeGame(gameId, changes, updatePlayers) {
	const lookupFilter = gameLookupFilter(gameId);
	return inTransaction(async (session) => {
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
		// Commit the game and both player updates together so a failed save
		// leaves the game retryable.
		const changed = await loadGameContext(game, session);
		updatePlayers(changed);
		for (const player of [changed.white, changed.black]) {
			if (player) await player.save({ session });
		}
		return changed;
	});
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
		await populateGamePlayers(game);
		return serializeGame(game);
	}
	/**
	 * Includes three functions:
	 * a. createGameFromPairing -> the function that creates the game when the pairing algorithm has decided a pairing
	 * b. submitGameResult		-> called by the administrator (via controller) when submitting a game result
	 * c. correctGameResult		-> called by the administrator to fix a result that was recorded wrongly
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

				// Reject paused/withdrawn players. The worker read its pool before
				// matching; by the time we land here, the admin may have flipped
				// status to 'paused' or 'withdrawn'. isPlaying alone does not catch that.
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
   * Marks game finished, applies result, and frees both players. Freed active
   * players are waiting again via waitingSince; the pairing settle window keeps
   * them from being re-paired while the admin is still entering results.
   */
	async submitGameResult(gameId, result) {
		const resultColor = normalizeResult(result);
		if (!resultColor) throw gameError('Invalid result value', 400, 'INVALID_RESULT');

		const { game } = await changeGame(
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

		// Refresh the persisted standing cache before returning. Refreshes are
		// still serialized per tournament to avoid stale concurrent writes.
		await scheduleStandingsRefresh(game.tournament);
		await populateGamePlayers(game);

		const serialized = serializeGame(game);
		await this.completeAfterGame(game.tournament);
		return serialized;
	}

	/**
	 * Replaces the result of a finished game, for example after it was entered
	 * on the wrong board. Only both players' scores, W/D/L and performance move;
	 * pairing history, availability and the tournament status are unchanged.
	 * Re-sending the recorded result is a no-op.
	 */
	async correctGameResult(gameId, result, { actor = null } = {}) {
		const resultColor = normalizeResult(result);
		if (!resultColor) throw gameError('Invalid result value', 400, 'INVALID_RESULT');
		const lookupFilter = gameLookupFilter(gameId);

		const { game, previousColor, white, black } = await inTransaction(async (session) => {
			const game = await Game.findOne(lookupFilter).session(session);
			if (!game) throw gameError('Game not found', 404, 'GAME_NOT_FOUND');
			if (game.isCancelled || !game.isFinished || !game.resultColor) {
				const message = game.isCancelled
					? `Game with ID: ${gameId} was cancelled and has no result to correct`
					: `Game with ID: ${gameId} has no result yet`;
				throw gameError(message, 409, 'GAME_NOT_SCORED');
			}
			const previousColor = game.resultColor;
			if (previousColor === resultColor) return { game, previousColor };

			// Snapshot transactions abort on a concurrent write to the game or
			// either player, and withTransaction retries from this read.
			game.resultColor = resultColor;
			await game.save({ session });
			const context = await loadGameContext(game, session);
			for (const [player, perspective] of [[context.white, 'white'], [context.black, 'black']]) {
				if (!player) continue;
				replaceResultForPlayer({ player, previousColor, resultColor, perspective });
				await player.save({ session });
			}
			return { ...context, previousColor };
		});
		await ensureDocumentPublicId(game, Game);

		if (previousColor !== resultColor) {
			await logEvent(game.tournament, 'game.result_corrected', {
				message: `Result corrected from ${RESULT_SCORES[previousColor]} to ${RESULT_SCORES[resultColor]}.`,
				payload: {
					gameId: game.publicId || String(game._id),
					boardNumber: game.boardNumber ?? null,
					previousResult: previousColor,
					result: resultColor,
					players: [white, black].filter(Boolean).map((player) => String(player._id)),
				},
				actor,
			});
			await scheduleStandingsRefresh(game.tournament);
		}

		await populateGamePlayers(game);
		return serializeGame(game);
	}

	/**
	 * Undoes a result that was entered on a game still being played, such as a
	 * click on the wrong board. The game is active again, both players are back
	 * in it, and the result no longer counts. Only allowed while the tournament
	 * is in progress: that is when the freed players can be paired elsewhere.
	 * Refused once either player is in another game or no longer active. The
	 * game keeps its board unless another game took it meanwhile.
	 */
	async reopenGame(gameId, { actor = null } = {}) {
		const lookupFilter = gameLookupFilter(gameId);

		const reopened = await inTransaction(async (session) => {
			const game = await Game.findOne(lookupFilter).session(session);
			if (!game) throw gameError('Game not found', 404, 'GAME_NOT_FOUND');
			if (game.isCancelled || !game.isFinished || !game.resultColor) {
				throw gameError(`Game with ID: ${gameId} has no result to undo`, 409, 'GAME_NOT_SCORED');
			}
			// Pairing and ending the tournament write this document too, so a
			// concurrent pairing or close conflicts with this transaction.
			const tournament = await Tournament.findOneAndUpdate(
				{ _id: game.tournament, tournStatus: 'in progress' },
				{ $inc: { pairingRevision: 1 } },
				{ session, returnDocument: 'after' },
			);
			if (!tournament) {
				throw gameError(
					'Games can only be reopened while the tournament is in progress. Correct the result once the game ends.',
					409, 'TOURNAMENT_NOT_RUNNING',
				);
			}

			const loadPlayer = (id) => Player.findById(id).populate('user', GAME_PLAYER_USER_FIELDS).session(session);
			const white = await loadPlayer(game.playerWhite);
			const black = await loadPlayer(game.playerBlack);
			for (const player of [white, black]) {
				if (!player) throw gameError('A player of this game no longer exists', 409, 'PLAYER_UNAVAILABLE');
				if (player.isPlaying) {
					const current = await Game.findOne({
						tournament: tournament._id, isFinished: false, isCancelled: { $ne: true },
						$or: [{ playerWhite: player._id }, { playerBlack: player._id }],
					}).select('boardNumber').session(session);
					const where = current?.boardNumber ? `board ${current.boardNumber}` : 'another game';
					throw gameError(`${playerName(player)} is already playing ${where}. Cancel that game first.`, 409, 'PLAYER_UNAVAILABLE');
				}
				if (player.status !== 'active') {
					throw gameError(`${playerName(player)} is ${player.status}. Resume them before reopening this game.`, 409, 'PLAYER_UNAVAILABLE');
				}
			}

			const previousBoardNumber = game.boardNumber;
			const boardTaken = await Game.exists({
				tournament: tournament._id, isFinished: false, isCancelled: { $ne: true }, boardNumber: previousBoardNumber,
			}).session(session);
			const boardNumber = boardTaken ? await lowestFreeBoardNumber(tournament._id, session) : previousBoardNumber;
			const previousColor = game.resultColor;

			game.set({ isFinished: false, resultColor: undefined, finishedAt: undefined, boardNumber });
			await game.save({ session });

			for (const [player, opponent, perspective] of [[white, black, 'white'], [black, white, 'black']]) {
				const previousGame = await Game.findOne({
					_id: { $ne: game._id }, tournament: tournament._id, isFinished: true, isCancelled: { $ne: true },
					$or: [{ playerWhite: player._id }, { playerBlack: player._id }],
				}).sort({ finishedAt: -1 }).select('finishedAt').session(session);
				withdrawResultFromPlayer({
					player,
					opponentRating: resolveOpponentRating(opponent),
					resultColor: previousColor,
					perspective,
					gameId: game._id,
					lastResultAt: previousGame?.finishedAt ?? null,
				});
				await player.save({ session });
			}
			return { game, white, black, previousColor, previousBoardNumber };
		});

		const { game, white, black, previousColor, previousBoardNumber } = reopened;
		await ensureDocumentPublicId(game, Game);
		const moved = game.boardNumber !== previousBoardNumber;
		await logEvent(game.tournament, 'game.reopened', {
			message: `Result ${RESULT_SCORES[previousColor]} removed; game reopened on board ${game.boardNumber}`
				+ `${moved ? ` (board ${previousBoardNumber} was in use)` : ''}.`,
			payload: {
				gameId: game.publicId || String(game._id),
				boardNumber: game.boardNumber,
				previousBoardNumber,
				previousResult: previousColor,
				players: [white, black].map((player) => String(player._id)),
			},
			actor,
		});
		await scheduleStandingsRefresh(game.tournament);

		await populateGamePlayers(game);
		return serializeGame(game);
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

		await this.completeAfterGame(game.tournament);
		await populateGamePlayers(game);

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

const playerName = (player) => buildDisplayName(player?.user, player?.tempName);

const summarizeGamePlayer = (player) => {
	if (!player) return null;
	const base = toPlain(player);
	const user = toPlain(base.user);
	return {
		id: base.publicId || null,
		userId: user.publicId || null,
		name: buildDisplayName(user, base.tempName),
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
