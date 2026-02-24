process.env.JWT_SECRET = 'test-secret-for-unit-tests';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');
const { connect, clearDatabase, disconnect } = require('./setup');
const authService = require('../src/services/authService');
const User = require('../src/models/User');

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

const createTournament = async (token, overrides = {}) => {
	const res = await request(app)
		.post('/api/admin/tournaments/create')
		.set('Authorization', `Bearer ${token}`)
		.send({
			name: 'Test Tournament',
			startDate: tomorrow(),
			endDate: dayAfter(),
			...overrides,
		});
	return res;
};

// ─────────────────────────────────────────────
// Public endpoints
// ─────────────────────────────────────────────
describe('GET /api/tournaments', () => {
	test('returns tournament list without auth', async () => {
		const res = await request(app).get('/api/tournaments');

		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
	});

	test('lists created tournaments', async () => {
		const { token } = await registerAndLogin('admin');
		await createTournament(token, { name: 'Public Tournament' });

		const res = await request(app).get('/api/tournaments');
		expect(res.body.length).toBeGreaterThanOrEqual(1);
		expect(res.body.some(t => t.name === 'Public Tournament')).toBe(true);
	});
});

describe('GET /api/tournaments/:id', () => {
	test('returns tournament detail', async () => {
		const { token } = await registerAndLogin('admin');
		const createRes = await createTournament(token, { name: 'Detailed' });
		const tournamentId = createRes.body.id;

		const res = await request(app).get(`/api/tournaments/${tournamentId}`);
		expect(res.status).toBe(200);
		expect(res.body.name).toBe('Detailed');
		expect(res.body.participants).toBeDefined();
	});

	test('returns error for non-existent tournament', async () => {
		const res = await request(app).get('/api/tournaments/nonexistent');
		expect(res.status).toBeGreaterThanOrEqual(400);
	});
});

describe('GET /api/tournaments/:id/players', () => {
	test('returns players list (public)', async () => {
		const { token } = await registerAndLogin('admin');
		const createRes = await createTournament(token);
		const tournamentId = createRes.body.id;

		const res = await request(app).get(`/api/tournaments/${tournamentId}/players`);
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
	});
});

describe('GET /api/tournaments/:id/standings', () => {
	test('returns standings (public)', async () => {
		const { token } = await registerAndLogin('admin');
		const createRes = await createTournament(token);
		const tournamentId = createRes.body.id;

		const res = await request(app).get(`/api/tournaments/${tournamentId}/standings`);
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
	});
});

describe('GET /api/tournaments/:id/games', () => {
	test('returns games list (public)', async () => {
		const { token } = await registerAndLogin('admin');
		const createRes = await createTournament(token);
		const tournamentId = createRes.body.id;

		const res = await request(app).get(`/api/tournaments/${tournamentId}/games`);
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
	});
});

// ─────────────────────────────────────────────
// Admin CRUD
// ─────────────────────────────────────────────
describe('POST /api/admin/tournaments/create', () => {
	test('creates tournament as admin (201)', async () => {
		const { token } = await registerAndLogin('admin');
		const res = await createTournament(token, { name: 'Admin Created' });

		expect(res.status).toBe(201);
		expect(res.body.name).toBe('Admin Created');
		expect(res.body.tournStatus).toBe('upcoming');
	});

	test('returns 401 without auth', async () => {
		const res = await request(app)
			.post('/api/admin/tournaments/create')
			.send({ name: 'Unauth', startDate: tomorrow(), endDate: dayAfter() });

		expect(res.status).toBe(401);
	});

	test('returns 403 for player role', async () => {
		const { token } = await registerAndLogin('player');
		const res = await createTournament(token);

		expect(res.status).toBe(403);
	});
});

describe('PATCH /api/admin/tournaments/:id/update', () => {
	test('updates tournament details', async () => {
		const { token } = await registerAndLogin('admin');
		const createRes = await createTournament(token);
		const tournamentId = createRes.body.id;

		const res = await request(app)
			.patch(`/api/admin/tournaments/${tournamentId}/update`)
			.set('Authorization', `Bearer ${token}`)
			.send({ name: 'Updated Name' });

		expect(res.status).toBe(200);
		expect(res.body.name).toBe('Updated Name');
	});
});

describe('DELETE /api/admin/tournaments/:id/delete', () => {
	test('deletes upcoming tournament', async () => {
		const { token } = await registerAndLogin('admin');
		const createRes = await createTournament(token);
		const tournamentId = createRes.body.id;

		const res = await request(app)
			.delete(`/api/admin/tournaments/${tournamentId}/delete`)
			.set('Authorization', `Bearer ${token}`);

		expect(res.status).toBe(200);
		expect(res.body.message).toContain('deleted');
	});
});

describe('POST /api/admin/tournaments/:id/start', () => {
	test('starts tournament', async () => {
		const { token } = await registerAndLogin('admin');
		const createRes = await createTournament(token);
		const tournamentId = createRes.body.id;

		const res = await request(app)
			.post(`/api/admin/tournaments/${tournamentId}/start`)
			.set('Authorization', `Bearer ${token}`);

		expect(res.status).toBe(200);
		expect(res.body.tournStatus).toBe('in progress');
	});
});

describe('POST /api/admin/tournaments/:id/end', () => {
	test('ends in-progress tournament', async () => {
		const { token } = await registerAndLogin('admin');
		const createRes = await createTournament(token);
		const tournamentId = createRes.body.id;

		// Start first
		await request(app)
			.post(`/api/admin/tournaments/${tournamentId}/start`)
			.set('Authorization', `Bearer ${token}`);

		const res = await request(app)
			.post(`/api/admin/tournaments/${tournamentId}/end`)
			.set('Authorization', `Bearer ${token}`);

		expect(res.status).toBe(200);
		expect(res.body.tournStatus).toBe('completed');
	});
});

// ─────────────────────────────────────────────
// Player actions (require auth)
// ─────────────────────────────────────────────
describe('POST /api/tournaments/:id/join', () => {
	test('lets authenticated player join', async () => {
		const admin = await registerAndLogin('admin');
		const player = await registerAndLogin('player');
		const createRes = await createTournament(admin.token);
		const tournamentId = createRes.body.id;

		const res = await request(app)
			.post(`/api/tournaments/${tournamentId}/join`)
			.set('Authorization', `Bearer ${player.token}`);

		expect(res.status).toBe(201);
		expect(res.body.userId).toBe(player.user.id);
	});

	test('returns 401 without auth', async () => {
		const admin = await registerAndLogin('admin');
		const createRes = await createTournament(admin.token);
		const tournamentId = createRes.body.id;

		const res = await request(app)
			.post(`/api/tournaments/${tournamentId}/join`);

		expect(res.status).toBe(401);
	});
});

describe('POST /api/tournaments/:id/leave', () => {
	test('lets player leave tournament', async () => {
		const admin = await registerAndLogin('admin');
		const player = await registerAndLogin('player');
		const createRes = await createTournament(admin.token);
		const tournamentId = createRes.body.id;

		await request(app)
			.post(`/api/tournaments/${tournamentId}/join`)
			.set('Authorization', `Bearer ${player.token}`);

		const res = await request(app)
			.post(`/api/tournaments/${tournamentId}/leave`)
			.set('Authorization', `Bearer ${player.token}`);

		expect(res.status).toBe(200);
		expect(res.body.message).toContain('withdrawn');
	});
});

// ─────────────────────────────────────────────
// Admin participant management
// ─────────────────────────────────────────────
describe('POST /api/admin/tournaments/:id/participants/add', () => {
	test('admin adds player to tournament', async () => {
		const admin = await registerAndLogin('admin');
		const player = await registerAndLogin('player');
		const createRes = await createTournament(admin.token);
		const tournamentId = createRes.body.id;

		const res = await request(app)
			.post(`/api/admin/tournaments/${tournamentId}/participants/add`)
			.set('Authorization', `Bearer ${admin.token}`)
			.send({ userId: player.user.id });

		expect(res.status).toBe(201);
	});

	test('rejects missing userId', async () => {
		const admin = await registerAndLogin('admin');
		const createRes = await createTournament(admin.token);
		const tournamentId = createRes.body.id;

		const res = await request(app)
			.post(`/api/admin/tournaments/${tournamentId}/participants/add`)
			.set('Authorization', `Bearer ${admin.token}`)
			.send({});

		expect(res.status).toBe(400);
	});
});

describe('DELETE /api/admin/tournaments/:id/participants/remove', () => {
	test('admin removes player from tournament', async () => {
		const admin = await registerAndLogin('admin');
		const player = await registerAndLogin('player');
		const createRes = await createTournament(admin.token);
		const tournamentId = createRes.body.id;

		// Add player first
		await request(app)
			.post(`/api/admin/tournaments/${tournamentId}/participants/add`)
			.set('Authorization', `Bearer ${admin.token}`)
			.send({ userId: player.user.id });

		const res = await request(app)
			.delete(`/api/admin/tournaments/${tournamentId}/participants/remove`)
			.set('Authorization', `Bearer ${admin.token}`)
			.send({ userId: player.user.id });

		expect(res.status).toBe(200);
	});
});

describe('POST /api/admin/tournaments/:id/participants/pause', () => {
	test('admin pauses player', async () => {
		const admin = await registerAndLogin('admin');
		const player = await registerAndLogin('player');
		const createRes = await createTournament(admin.token);
		const tournamentId = createRes.body.id;

		await request(app)
			.post(`/api/admin/tournaments/${tournamentId}/participants/add`)
			.set('Authorization', `Bearer ${admin.token}`)
			.send({ userId: player.user.id });

		const res = await request(app)
			.post(`/api/admin/tournaments/${tournamentId}/participants/pause`)
			.set('Authorization', `Bearer ${admin.token}`)
			.send({ userId: player.user.id });

		expect(res.status).toBe(200);
		expect(res.body.status).toBe('paused');
	});
});

describe('POST /api/admin/tournaments/:id/participants/resume', () => {
	test('admin resumes paused player', async () => {
		const admin = await registerAndLogin('admin');
		const player = await registerAndLogin('player');
		const createRes = await createTournament(admin.token);
		const tournamentId = createRes.body.id;

		// Add and pause player
		await request(app)
			.post(`/api/admin/tournaments/${tournamentId}/participants/add`)
			.set('Authorization', `Bearer ${admin.token}`)
			.send({ userId: player.user.id });

		await request(app)
			.post(`/api/admin/tournaments/${tournamentId}/participants/pause`)
			.set('Authorization', `Bearer ${admin.token}`)
			.send({ userId: player.user.id });

		const res = await request(app)
			.post(`/api/admin/tournaments/${tournamentId}/participants/resume`)
			.set('Authorization', `Bearer ${admin.token}`)
			.send({ userId: player.user.id });

		expect(res.status).toBe(200);
		expect(res.body.status).toBe('active');
	});
});
