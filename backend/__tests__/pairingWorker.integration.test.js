const { connect, clearDatabase, disconnect } = require('./setup');
const Tournament = require('../src/models/Tournament');
const Player = require('../src/models/Player');
const Game = require('../src/models/Game');
const tournamentService = require('../src/services/tournamentService');
const { PairingWorker } = require('../src/services/pairing/pairingWorker');

beforeAll(connect);
afterEach(clearDatabase);
afterAll(disconnect);

const waitFor = async (check, timeoutMs = 5000) => {
	const deadline = Date.now() + timeoutMs;
	while (!(await check())) {
		if (Date.now() > deadline) throw new Error('Timed out waiting for condition');
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
};

test('worker pairs active idle players read from MongoDB and skips paused ones', async () => {
	const tournament = await Tournament.create({ name: 'Mongo pool', durationMs: 600000 });
	const active = await Player.create([1500, 1520, 1540, 1560].map((entryRating, i) => ({
		tournament: tournament._id, tempName: `Active ${i}`, entryRating,
	})));
	const paused = await Player.create({ tournament: tournament._id, tempName: 'Paused', entryRating: 1530, status: 'paused' });
	await Game.init();
	await tournamentService.startTournament(tournament._id);

	const worker = new PairingWorker({ workerId: 'test', settleMs: 0, idleMs: 20 });
	const running = worker.start(tournament._id);
	try {
		await waitFor(async () => (await Game.countDocuments({ tournament: tournament._id })) === 2);
	} finally {
		worker.stop();
		await running;
	}

	const games = await Game.find({ tournament: tournament._id });
	const seated = new Set(games.flatMap((game) => [String(game.playerWhite), String(game.playerBlack)]));
	expect(seated).toEqual(new Set(active.map((player) => String(player._id))));
	expect(await Player.countDocuments({ _id: { $in: active.map((player) => player._id) }, isPlaying: true })).toBe(4);
	expect((await Player.findById(paused._id)).isPlaying).toBe(false);
});

test('a resumed player is paired on the next cycle without any queue step', async () => {
	const tournament = await Tournament.create({ name: 'Resume', durationMs: 600000 });
	const [first, second] = await Player.create([
		{ tournament: tournament._id, tempName: 'Waiting', entryRating: 1500 },
		{ tournament: tournament._id, tempName: 'Returning', entryRating: 1500, status: 'paused' },
	]);
	await Game.init();
	await tournamentService.startTournament(tournament._id);

	const worker = new PairingWorker({ workerId: 'test', settleMs: 0, idleMs: 20 });
	const running = worker.start(tournament._id);
	try {
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(await Game.countDocuments({ tournament: tournament._id })).toBe(0);
		await tournamentService.resumePlayer(second._id, tournament._id);
		await waitFor(async () => (await Game.countDocuments({ tournament: tournament._id })) === 1);
	} finally {
		worker.stop();
		await running;
	}

	const game = await Game.findOne({ tournament: tournament._id });
	expect(new Set([String(game.playerWhite), String(game.playerBlack)])).toEqual(new Set([String(first._id), String(second._id)]));
});
