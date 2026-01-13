const mongoose = require('mongoose');
const Game = require('../models/Game');
const Player = require('../models/Player');
const Tournament = require('../models/Tournament');
const { enqueue } = require('./queue/redisQueue');
const {
	findByIdOrPublicId,
	ensureDocumentPublicId,
} = require('../utils/identifiers');

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function asNumber(value, fallback = 0) {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

function resolveOpponentRating(opponent) {
	if (!opponent) return 0;
	const rating = asNumber(opponent.liveRating);
	if (rating !== 0) return rating;
	return asNumber(opponent.entryRating, 0);
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

	player.liveRating = calculatePerformanceRating({
		sumOpponentRatings: player.sumOpponentRatings,
		gamesPlayed: player.gamesPlayed,
		score: player.score,
	});
}

class GameService {
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
				const [white, black] = await Promise.all([
					Player.findOne({ _id: whitePlayerId, tournament: tournamentId }).session(session).exec(),
					Player.findOne({ _id: blackPlayerId, tournament: tournamentId }).session(session).exec(),
				]);

				if (!white || !black || white.isPlaying || black.isPlaying) {
					throw new Error('Players busy or not found');
				}

				const game = new Game({
					playerWhite: whitePlayerId,
					playerBlack: blackPlayerId,
					tournament: tournamentId,
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

				await Promise.all([
					white.save({ session }),
					black.save({ session }),
					game.save({ session }),
				]);

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
		const game = await findByIdOrPublicId(Game, gameId);
		if (!game) throw new Error('Game not found');
		if (game.isFinished) throw new Error(`Game with ID: ${gameId} already finished with result ${game.resultColor}`);

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

		game.resultColor = resultColor;
		game.isFinished = true;
		game.finishedAt = new Date();
		await game.save();
		await ensureDocumentPublicId(game, Game);
		console.log(`[GameService] Game ended with result: ${resultColor}`);

		const [tournament, white, black] = await Promise.all([
			Tournament.findById(game.tournament).select('tournStatus'),
			Player.findById(game.playerWhite),
			Player.findById(game.playerBlack),
		]);

		const tournamentActive = tournament?.tournStatus === 'in progress';
		const opponentRatings = {
			white: resolveOpponentRating(black),
			black: resolveOpponentRating(white),
		};

		if (white) {
			applyResultToPlayer({
				player: white,
				opponentRating: opponentRatings.white,
				resultColor,
				perspective: 'white',
				gameId: game._id,
			});
			const shouldWait = tournamentActive && (!white.status || white.status === 'active');
			white.waitingSince = shouldWait ? new Date() : null;
			await white.save();
		}
		if (black) {
			applyResultToPlayer({
				player: black,
				opponentRating: opponentRatings.black,
				resultColor,
				perspective: 'black',
				gameId: game._id,
			});
			const shouldWait = tournamentActive && (!black.status || black.status === 'active');
			black.waitingSince = shouldWait ? new Date() : null;
			await black.save();
		}

		if (!tournamentActive) {
			return game;
		}

		const buildSnapshot = (player) => ({
			_id: String(player._id),
			user: player.user,
			score: player.score ?? 0,
			liveRating: player.liveRating ?? 0,
			entryRating: player.entryRating ?? 0,
			recentOpponents: (player.recentOpponents ?? []).map(String),
			colorHistory: player.colorHistory ?? [],
			status: player.status,
			waitingSince: player.waitingSince ?? null,
			enqueuedAt: Date.now(),
		});

		// Small delay before re-enqueueing to prevent instant re-pairing
		// when admin terminates multiple games quickly
		const REQUEUE_DELAY_MS = 5000;
		setTimeout(async () => {
			for (const player of [white, black]) {
				if (!player || (player.status && player.status !== 'active')) continue;
				await enqueue(String(game.tournament), buildSnapshot(player));
			}
		}, REQUEUE_DELAY_MS);

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
		liveRating: base.liveRating ?? base.entryRating ?? user.globalElo ?? 0,
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
		startedAt: base.createdAt || null,
		playerWhite: summarizeGamePlayer(base.playerWhite),
		playerBlack: summarizeGamePlayer(base.playerBlack),
	};
};
