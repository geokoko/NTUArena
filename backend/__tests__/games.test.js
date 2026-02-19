const { connect, clearDatabase, disconnect } = require('./setup');
const gameService = require('../src/services/gameService');
const tournamentService = require('../src/services/tournamentService');
const userService = require('../src/services/userService');
const Tournament = require('../src/models/Tournament');
const Player = require('../src/models/Player');
const Game = require('../src/models/Game');

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
		startDate: tomorrow(),
		endDate: dayAfter(),
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

		expect(updatedBlack.losses).toBe(1);
		expect(updatedBlack.gamesPlayed).toBe(1);
		expect(updatedBlack.score).toBe(0);
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
