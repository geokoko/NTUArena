const mongoose = require('mongoose');
const Game = require('../models/Game');
const Player = require('../models/Player');
const { enqueue } = require('./queue/redisQueue');

class GameService {
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
		const game = await Game.findById(gameId);
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
		console.log(`[GameService] Game ended with result: ${resultColor}`);

		// Free both players, update their scores, game History, performance rating and set waitingSince
		const now = new Date();
		const [white, black] = await Promise.all([
			Player.findById(game.playerWhite),
			Player.findById(game.playerBlack),
		]);

		if (white) {
			white.isPlaying = false;
			white.waitingSince = now;
			if (resultColor === 'white') {
				white.score = (white.score || 0) + 1;
			}
			else if (resultColor === 'draw') {
				white.score = (white.score || 0) + 0.5;
			}
			white.gameHistory = [...(white.gameHistory || []), game._id].slice(-50);
			console.log(`[GameService] Player ${white.user} new score: ${white.score}`);
			await white.save();
		}
		if (black) {
			black.isPlaying = false;
			black.waitingSince = now;
			if (resultColor === 'black') {
				black.score = (black.score || 0) + 1;
			}
			else if (resultColor === 'draw') {
				black.score = (black.score || 0) + 0.5;
			}
			black.gameHistory = [...(black.gameHistory || []), game._id].slice(-50);
			console.log(`[GameService] Player ${black.user} new score: ${black.score}`);
			await black.save();
		}

		// Re-enqueue both with fresh snapshots so pairing worker can match them
		// (We keep queue payload minimal and fast.)
		const [wSnap, bSnap] = await Promise.all([
			Player.findById(game.playerWhite).select('_id user score liveRating recentOpponents colorHistory waitingSince'),
			Player.findById(game.playerBlack).select('_id user score liveRating recentOpponents colorHistory waitingSince'),
		]);

		console.log(`[GameService] Re-enqueueing players ${white.user} and ${black.user} after game completion.`);
		for (const p of [wSnap, bSnap]) {
			if (!p) continue;
			await enqueue(String(game.tournament), {
				_id: String(p._id),
				user: p.user,
				score: p.score ?? 0,
				liveRating: p.liveRating ?? 1200,
				recentOpponents: (p.recentOpponents ?? []).map(String),
				colorHistory: p.colorHistory ?? [],
				waitingSince: p.waitingSince ?? now,
				enqueuedAt: Date.now(),
			});
		}

		return game;
	}
}

module.exports = new GameService();
