process.env.JWT_SECRET = 'test-secret-for-unit-tests';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');
const { connect, clearDatabase, disconnect } = require('./setup');
const authService = require('../src/services/authService');
const User = require('../src/models/User');
const Tournament = require('../src/models/Tournament');
const Player = require('../src/models/Player');
const Game = require('../src/models/Game');

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await disconnect());

// Helpers
const registerAndLogin = async (role = 'player') => {
	const ts = Date.now() + Math.random().toString(36).slice(2, 6);
	const user = await authService.register({
		username: `user_${ts}`,
		email: `user_${ts}@test.com`,
		password: 'password123',
	});

	if (role !== 'player') {
		await User.updateOne({ publicId: user.id }, { role });
	}

	const { token } = await authService.login(user.username, 'password123');
	return { user, token };
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

// Setup a tournament with two players and a game
const setupGame = async (adminToken) => {
	// Create tournament
	const tRes = await request(app)
		.post('/api/admin/tournaments/create')
		.set('Authorization', `Bearer ${adminToken}`)
		.send({ name: 'Game Test', startDate: tomorrow(), endDate: dayAfter() });

	const tournamentId = tRes.body.id;
	const tournDoc = await Tournament.findOne({ publicId: tournamentId });

	// Create two players
	const p1 = await registerAndLogin('player');
	const p2 = await registerAndLogin('player');

	await request(app)
		.post(`/api/admin/tournaments/${tournamentId}/participants/add`)
		.set('Authorization', `Bearer ${adminToken}`)
		.send({ userId: p1.user.id });

	await request(app)
		.post(`/api/admin/tournaments/${tournamentId}/participants/add`)
		.set('Authorization', `Bearer ${adminToken}`)
		.send({ userId: p2.user.id });

	const players = await Player.find({ tournament: tournDoc._id });

	// Create a game manually
	const game = new Game({
		playerWhite: players[0]._id,
		playerBlack: players[1]._id,
		tournament: tournDoc._id,
		isFinished: false,
	});
	await game.save();

	await Player.updateMany(
		{ _id: { $in: [players[0]._id, players[1]._id] } },
		{ isPlaying: true }
	);

	return { game, tournamentId };
};

// ─────────────────────────────────────────────
// GET /api/games/:id
// ─────────────────────────────────────────────
describe('GET /api/games/:id', () => {
	test('returns game by id (public)', async () => {
		const admin = await registerAndLogin('admin');
		const { game } = await setupGame(admin.token);

		const res = await request(app).get(`/api/games/${game._id}`);

		expect(res.status).toBe(200);
		expect(res.body.playerWhite).toBeDefined();
		expect(res.body.playerBlack).toBeDefined();
		expect(res.body.isFinished).toBe(false);
	});

	test('returns 404 for non-existent game', async () => {
		const res = await request(app).get('/api/games/nonexistent');

		expect(res.status).toBe(404);
		expect(res.body.error).toContain('not found');
	});
});

// ─────────────────────────────────────────────
// POST /api/games/:id/result
// ─────────────────────────────────────────────
describe('POST /api/games/:id/result', () => {
	test('admin submits game result (200)', async () => {
		const admin = await registerAndLogin('admin');
		const { game } = await setupGame(admin.token);

		const res = await request(app)
			.post(`/api/games/${game._id}/result`)
			.set('Authorization', `Bearer ${admin.token}`)
			.send({ result: '1-0' });

		expect(res.status).toBe(200);
		expect(res.body.resultColor).toBe('white');
		expect(res.body.isFinished).toBe(true);
	});

	test('returns 401 without auth', async () => {
		const admin = await registerAndLogin('admin');
		const { game } = await setupGame(admin.token);

		const res = await request(app)
			.post(`/api/games/${game._id}/result`)
			.send({ result: '1-0' });

		expect(res.status).toBe(401);
	});

	test('returns 403 for player role', async () => {
		const admin = await registerAndLogin('admin');
		const player = await registerAndLogin('player');
		const { game } = await setupGame(admin.token);

		const res = await request(app)
			.post(`/api/games/${game._id}/result`)
			.set('Authorization', `Bearer ${player.token}`)
			.send({ result: '1-0' });

		expect(res.status).toBe(403);
	});
});
