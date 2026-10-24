const { connect, clearDatabase, disconnect } = require('./setup');
const gameService = require('../src/services/gameService');
const tournamentService = require('../src/services/tournamentService');
const userService = require('../src/services/userService');
const Tournament = require('../src/models/Tournament');
const Player = require('../src/models/Player');
const Game = require('../src/models/Game');
const TournamentLog = require('../src/models/TournamentLog');

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await disconnect());

// Helpers
const createTestUser = async (overrides = {}) => {
	const ts = Date.now() + Math.random().toString(36).slice(2, 6);
	return userService.addUser({
		username: `user_${ts}`,
		email: `user_${ts}@test.com`,
		role: 'player',
		globalElo: 1500,
		...overrides,
	});
};

const tomorrow = () => {
	const d = new Date();
	d.setDate(d.getDate() + 1);
	return d.toISOString();
};
const dayAfter = () => {
	const d = new Date();
	d.setDate(d.getDate() + 2);
	return d.toISOString();
};

// Setup: create tournament + 2 players + 1 game ready for result submission
const setupGameFixture = async () => {
	const user1 = await createTestUser({ globalElo: 1500 });
	const user2 = await createTestUser({ globalElo: 1600 });

	const t = await tournamentService.createTournament({
		name: 'Game Test Tournament',
		scheduledStartDate: tomorrow(),
		durationMs: 24 * 60 * 60 * 1000,
	});

	await tournamentService.joinTournament(user1.id, t.id);
	await tournamentService.joinTournament(user2.id, t.id);

	// Get the tournament DB doc to find player _ids
	const tournDoc = await Tournament.findOne({ publicId: t.id });
	const players = await Player.find({ tournament: tournDoc._id });

	// Manually create a game (simulating what pairingService would do)
	const game = new Game({
		playerWhite: players[0]._id,
		playerBlack: players[1]._id,
		tournament: tournDoc._id,
		boardNumber: 1,
		isFinished: false,
	});
	await game.save();

	// Mark both players as in a game
	await Player.updateMany(
		{ _id: { $in: [players[0]._id, players[1]._id] } },
		{ isPlaying: true }
	);

	return {
		game,
		tournament: tournDoc,
		whitePlayer: players[0],
		blackPlayer: players[1],
		user1,
		user2,
	};
};

// ─────────────────────────────────────────────
// getGameById
// ─────────────────────────────────────────────
describe('getGameById', () => {
	test('returns game with populated players', async () => {
		const { game } = await setupGameFixture();
		const result = await gameService.getGameById(game._id.toString());

		expect(result.id).toBeDefined();
		expect(result.playerWhite).toBeDefined();
		expect(result.playerBlack).toBeDefined();
		expect(result.isFinished).toBe(false);
	});

	test('throws for non-existent game', async () => {
		await expect(
			gameService.getGameById('nonexistent')
		).rejects.toThrow('Game not found');
	});

	test('names CSV players without an account by their temp name', async () => {
		const { tournament, whitePlayer } = await setupGameFixture();
		const guest = await Player.create({ tournament: tournament._id, tempName: 'Guest Player' });
		const game = await Game.create({ playerWhite: whitePlayer._id, playerBlack: guest._id, tournament: tournament._id, boardNumber: 2 });

		const result = await gameService.getGameById(game.publicId);

		expect(result.playerBlack.name).toBe('Guest Player');
		expect(result.playerWhite.name).toBe(result.playerWhite.username);
	});
});

// ─────────────────────────────────────────────
// submitGameResult
// ─────────────────────────────────────────────
describe('submitGameResult', () => {
	test('records white win (1-0)', async () => {
		const { game } = await setupGameFixture();
		const result = await gameService.submitGameResult(game._id.toString(), '1-0');

		expect(result.isFinished).toBe(true);
		expect(result.resultColor).toBe('white');
	});

	test('records black win (0-1)', async () => {
		const { game } = await setupGameFixture();
		const result = await gameService.submitGameResult(game._id.toString(), '0-1');

		expect(result.resultColor).toBe('black');
	});

	test('records draw (1/2-1/2)', async () => {
		const { game } = await setupGameFixture();
		const result = await gameService.submitGameResult(game._id.toString(), '1/2-1/2');

		expect(result.resultColor).toBe('draw');
	});

	test('accepts alternative result formats', async () => {
		// Test 'white', 'black', 'draw' literals
		const f1 = await setupGameFixture();
		const r1 = await gameService.submitGameResult(f1.game._id.toString(), 'white');
		expect(r1.resultColor).toBe('white');

		const f2 = await setupGameFixture();
		const r2 = await gameService.submitGameResult(f2.game._id.toString(), 'draw');
		expect(r2.resultColor).toBe('draw');
	});

	test('updates player stats after white win', async () => {
		const { game, whitePlayer, blackPlayer } = await setupGameFixture();
		await gameService.submitGameResult(game._id.toString(), '1-0');

		const updatedWhite = await Player.findById(whitePlayer._id);
		const updatedBlack = await Player.findById(blackPlayer._id);

		expect(updatedWhite.wins).toBe(1);
		expect(updatedWhite.gamesPlayed).toBe(1);
		expect(updatedWhite.score).toBe(1);
		expect(updatedWhite.isPlaying).toBe(false);
		expect(updatedWhite.performanceRating).toBeGreaterThan(0);

		expect(updatedBlack.losses).toBe(1);
		expect(updatedBlack.gamesPlayed).toBe(1);
		expect(updatedBlack.score).toBe(0);
		expect(updatedBlack.performanceRating).toBeGreaterThanOrEqual(0);
	});

	test('updates player stats after draw', async () => {
		const { game, whitePlayer, blackPlayer } = await setupGameFixture();
		await gameService.submitGameResult(game._id.toString(), 'draw');

		const updatedWhite = await Player.findById(whitePlayer._id);
		const updatedBlack = await Player.findById(blackPlayer._id);

		expect(updatedWhite.draws).toBe(1);
		expect(updatedWhite.score).toBe(0.5);
		expect(updatedBlack.draws).toBe(1);
		expect(updatedBlack.score).toBe(0.5);
	});

	test('rejects invalid result value', async () => {
		const { game } = await setupGameFixture();
		await expect(
			gameService.submitGameResult(game._id.toString(), 'invalid')
		).rejects.toThrow('Invalid result value');
	});

	test('rejects submitting result for already finished game', async () => {
		const { game } = await setupGameFixture();
		await gameService.submitGameResult(game._id.toString(), '1-0');

		await expect(
			gameService.submitGameResult(game._id.toString(), '0-1')
		).rejects.toThrow('already finished');
	});

	test('rejects non-existent game', async () => {
		await expect(
			gameService.submitGameResult('nonexistent', '1-0')
		).rejects.toThrow('Game not found');
	});
});

// ─────────────────────────────────────────────
// correctGameResult
// ─────────────────────────────────────────────
describe('correctGameResult', () => {
	const STAT_FIELDS = ['score', 'wins', 'draws', 'losses', 'gamesPlayed', 'sumOpponentRatings', 'performanceRating'];
	const statsOf = async (player) => {
		const doc = await Player.findById(player._id).lean();
		return Object.fromEntries(STAT_FIELDS.map((field) => [field, doc[field]]));
	};

	test.each([
		['1-0', '0-1'],
		['1-0', '1/2-1/2'],
		['1/2-1/2', '0-1'],
		['0-1', '1-0'],
	])('a %s result corrected to %s matches entering the right result first', async (recorded, corrected) => {
		const wrong = await setupGameFixture();
		await gameService.submitGameResult(wrong.game._id.toString(), recorded);
		const result = await gameService.correctGameResult(wrong.game.publicId, corrected);

		const right = await setupGameFixture();
		await gameService.submitGameResult(right.game._id.toString(), corrected);

		expect(result.resultColor).toBe((await Game.findById(right.game._id)).resultColor);
		expect(await statsOf(wrong.whitePlayer)).toEqual(await statsOf(right.whitePlayer));
		expect(await statsOf(wrong.blackPlayer)).toEqual(await statsOf(right.blackPlayer));
	});

	test('leaves players in whatever game or wait they moved on to', async () => {
		const { game, whitePlayer, blackPlayer } = await setupGameFixture();
		await gameService.submitGameResult(game._id.toString(), '1-0');
		const waitingSince = new Date('2026-01-01T10:00:00Z');
		await Player.updateOne({ _id: whitePlayer._id }, { isPlaying: true, waitingSince: null });
		await Player.updateOne({ _id: blackPlayer._id }, { waitingSince });

		await gameService.correctGameResult(game.publicId, '0-1');

		const white = await Player.findById(whitePlayer._id);
		const black = await Player.findById(blackPlayer._id);
		expect(white.isPlaying).toBe(true);
		expect(white.waitingSince).toBeNull();
		expect(black.isPlaying).toBe(false);
		expect(black.waitingSince).toEqual(waitingSince);
		expect(white.gameHistory.map(String)).toEqual([String(game._id)]);
	});

	test('refreshes standings and logs who corrected the result', async () => {
		const { game, tournament, whitePlayer, blackPlayer } = await setupGameFixture();
		await gameService.submitGameResult(game._id.toString(), '1-0');
		expect((await Player.findById(whitePlayer._id)).standing).toBe(1);

		await gameService.correctGameResult(game.publicId, '0-1', { actor: { publicId: 'arbiter', username: 'Arbiter' } });

		expect((await Player.findById(blackPlayer._id)).standing).toBe(1);
		expect((await Player.findById(whitePlayer._id)).standing).toBe(2);
		const log = await TournamentLog.findOne({ tournamentId: tournament._id, eventType: 'game.result_corrected' }).lean();
		expect(log).toMatchObject({
			message: 'Result corrected from 1-0 to 0-1.',
			payload: { gameId: game.publicId, boardNumber: 1, previousResult: 'white', result: 'black' },
			actor: { userId: 'arbiter', username: 'Arbiter' },
		});
	});

	test('treats the recorded result as a no-op', async () => {
		const { game, tournament, whitePlayer } = await setupGameFixture();
		await gameService.submitGameResult(game._id.toString(), 'draw');
		const before = await statsOf(whitePlayer);

		const result = await gameService.correctGameResult(game.publicId, '1/2-1/2');

		expect(result.resultColor).toBe('draw');
		expect(await statsOf(whitePlayer)).toEqual(before);
		expect(await TournamentLog.countDocuments({ tournamentId: tournament._id, eventType: 'game.result_corrected' })).toBe(0);
	});

	test('rejects games without a recorded result', async () => {
		const { game } = await setupGameFixture();
		await expect(gameService.correctGameResult(game.publicId, '1-0'))
			.rejects.toMatchObject({ status: 409, code: 'GAME_NOT_SCORED' });

		await gameService.cancelGame(game.publicId);
		await expect(gameService.correctGameResult(game.publicId, '1-0'))
			.rejects.toMatchObject({ status: 409, code: 'GAME_NOT_SCORED', message: expect.stringContaining('cancelled') });
	});

	test('rejects invalid results and unknown games', async () => {
		const { game } = await setupGameFixture();
		await gameService.submitGameResult(game._id.toString(), '1-0');
		await expect(gameService.correctGameResult(game.publicId, 'invalid'))
			.rejects.toMatchObject({ status: 400, message: 'Invalid result value' });
		await expect(gameService.correctGameResult('missing', '0-1'))
			.rejects.toMatchObject({ status: 404 });
		expect((await Game.findById(game._id)).resultColor).toBe('white');
	});
});

// ─────────────────────────────────────────────
// reopenGame
// ─────────────────────────────────────────────
describe('reopenGame', () => {
	const PLAYER_FIELDS = ['score', 'wins', 'draws', 'losses', 'gamesPlayed', 'sumOpponentRatings', 'performanceRating', 'isPlaying', 'waitingSince'];
	const snapshot = async (player) => {
		const doc = await Player.findById(player._id).lean();
		return { ...Object.fromEntries(PLAYER_FIELDS.map((field) => [field, doc[field]])), gameHistory: doc.gameHistory.map(String) };
	};
	// A started tournament whose players were paired into the fixture game.
	const runningFixture = async () => {
		const fixture = await setupGameFixture();
		await Tournament.updateOne({ _id: fixture.tournament._id }, { tournStatus: 'in progress' });
		await Player.updateMany({ tournament: fixture.tournament._id }, { waitingSince: null });
		return fixture;
	};
	const tempPlayer = (tournament, tempName) => Player.create({ tournament: tournament._id, tempName, isPlaying: true, waitingSince: null });

	test('puts the game and both players back to before the result', async () => {
		const { game, whitePlayer, blackPlayer } = await runningFixture();
		const before = [await snapshot(whitePlayer), await snapshot(blackPlayer)];
		await gameService.submitGameResult(game.publicId, '1-0');

		const result = await gameService.reopenGame(game.publicId);

		expect(result).toMatchObject({ id: game.publicId, isFinished: false, resultColor: null, finishedAt: null, boardNumber: 1 });
		expect([await snapshot(whitePlayer), await snapshot(blackPlayer)]).toEqual(before);
		expect((await Player.findById(whitePlayer._id)).lastResultAt).toBeNull();
	});

	test('keeps earlier results and the earlier result time', async () => {
		const { game, tournament, whitePlayer, blackPlayer } = await runningFixture();
		await gameService.submitGameResult(game.publicId, '1-0');
		await Player.updateMany({ _id: { $in: [whitePlayer._id, blackPlayer._id] } }, { isPlaying: true, waitingSince: null });
		const afterFirst = [await snapshot(whitePlayer), await snapshot(blackPlayer)];
		const second = await Game.create({ playerWhite: blackPlayer._id, playerBlack: whitePlayer._id, tournament: tournament._id, boardNumber: 1 });
		await gameService.submitGameResult(second.publicId, 'draw');

		await gameService.reopenGame(second.publicId);

		expect([await snapshot(whitePlayer), await snapshot(blackPlayer)]).toEqual(afterFirst);
		const { finishedAt } = await Game.findById(game._id);
		expect((await Player.findById(whitePlayer._id)).lastResultAt).toEqual(finishedAt);
		expect((await Player.findById(blackPlayer._id)).lastResultAt).toEqual(finishedAt);
	});

	test('moves to the lowest free board when another game took its board, and logs it', async () => {
		const { game, tournament } = await runningFixture();
		await gameService.submitGameResult(game.publicId, '1-0');
		const [cleo, dino] = [await tempPlayer(tournament, 'Cleo'), await tempPlayer(tournament, 'Dino')];
		await Game.create({ playerWhite: cleo._id, playerBlack: dino._id, tournament: tournament._id, boardNumber: 1 });

		const result = await gameService.reopenGame(game.publicId, { actor: { publicId: 'arbiter', username: 'Arbiter' } });

		expect(result.boardNumber).toBe(2);
		const log = await TournamentLog.findOne({ tournamentId: tournament._id, eventType: 'game.reopened' }).lean();
		expect(log).toMatchObject({
			message: 'Result 1-0 removed; game reopened on board 2 (board 1 was in use).',
			payload: { gameId: game.publicId, boardNumber: 2, previousBoardNumber: 1, previousResult: 'white' },
			actor: { userId: 'arbiter', username: 'Arbiter' },
		});
	});

	test('refuses while a player is already in another game', async () => {
		const { game, tournament, whitePlayer } = await runningFixture();
		await gameService.submitGameResult(game.publicId, '1-0');
		const cleo = await tempPlayer(tournament, 'Cleo');
		await Player.updateOne({ _id: whitePlayer._id }, { isPlaying: true, waitingSince: null });
		await Game.create({ playerWhite: whitePlayer._id, playerBlack: cleo._id, tournament: tournament._id, boardNumber: 3 });

		await expect(gameService.reopenGame(game.publicId)).rejects.toMatchObject({
			status: 409, code: 'PLAYER_UNAVAILABLE', message: expect.stringContaining('is already playing board 3. Cancel that game first.'),
		});
		expect(await Game.findById(game._id)).toMatchObject({ isFinished: true, resultColor: 'white' });
		expect((await Player.findById(whitePlayer._id)).gamesPlayed).toBe(1);
	});

	test('refuses unscored games, paused players and tournaments that are not in progress', async () => {
		const { game, tournament, blackPlayer } = await runningFixture();
		await expect(gameService.reopenGame(game.publicId)).rejects.toMatchObject({ status: 409, code: 'GAME_NOT_SCORED' });

		await gameService.submitGameResult(game.publicId, 'draw');
		await Player.updateOne({ _id: blackPlayer._id }, { status: 'paused' });
		await expect(gameService.reopenGame(game.publicId)).rejects.toMatchObject({
			status: 409, code: 'PLAYER_UNAVAILABLE', message: expect.stringContaining('is paused'),
		});

		await Player.updateOne({ _id: blackPlayer._id }, { status: 'active' });
		await Tournament.updateOne({ _id: tournament._id }, { tournStatus: 'finishing' });
		await expect(gameService.reopenGame(game.publicId)).rejects.toMatchObject({ status: 409, code: 'TOURNAMENT_NOT_RUNNING' });
		expect(await Game.findById(game._id)).toMatchObject({ isFinished: true, resultColor: 'draw' });
		await expect(gameService.reopenGame('missing')).rejects.toMatchObject({ status: 404 });
	});
});
