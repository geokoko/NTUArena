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

// ─────────────────────────────────────────────
// Admin auth guard
// ─────────────────────────────────────────────
describe('Admin user endpoints - auth guard', () => {
	test('returns 401 without token', async () => {
		const res = await request(app).get('/api/admin/users');
		expect(res.status).toBe(401);
	});

	test('returns 403 for player role', async () => {
		const { token } = await registerAndLogin('player');
		const res = await request(app)
			.get('/api/admin/users')
			.set('Authorization', `Bearer ${token}`);
		expect(res.status).toBe(403);
	});
});

// ─────────────────────────────────────────────
// GET /api/admin/users
// ─────────────────────────────────────────────
describe('GET /api/admin/users', () => {
	test('lists users for admin', async () => {
		const { token } = await registerAndLogin('admin');

		const res = await request(app)
			.get('/api/admin/users')
			.set('Authorization', `Bearer ${token}`);

		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
		expect(res.body.length).toBeGreaterThanOrEqual(1); // at least the admin user
	});
});

// ─────────────────────────────────────────────
// POST /api/admin/users
// ─────────────────────────────────────────────
describe('POST /api/admin/users', () => {
	test('creates user as admin (201)', async () => {
		const { token } = await registerAndLogin('admin');

		const res = await request(app)
			.post('/api/admin/users')
			.set('Authorization', `Bearer ${token}`)
			.send({ username: 'created_by_admin', email: 'admin_created@test.com', role: 'player' });

		expect(res.status).toBe(201);
		expect(res.body.username).toBe('created_by_admin');
	});
});

// ─────────────────────────────────────────────
// GET /api/admin/users/:id
// ─────────────────────────────────────────────
describe('GET /api/admin/users/:id', () => {
	test('returns single user by publicId', async () => {
		const { token, user } = await registerAndLogin('admin');

		const res = await request(app)
			.get(`/api/admin/users/${user.id}`)
			.set('Authorization', `Bearer ${token}`);

		expect(res.status).toBe(200);
		expect(res.body.username).toBe(user.username);
	});

	test('returns 500 for non-existent user', async () => {
		const { token } = await registerAndLogin('admin');

		const res = await request(app)
			.get('/api/admin/users/nonexistent')
			.set('Authorization', `Bearer ${token}`);

		expect(res.status).toBe(500);
	});
});

// ─────────────────────────────────────────────
// PATCH /api/admin/users/:id
// ─────────────────────────────────────────────
describe('PATCH /api/admin/users/:id', () => {
	test('updates user fields', async () => {
		const { token } = await registerAndLogin('admin');
		// Create a user first
		const createRes = await request(app)
			.post('/api/admin/users')
			.set('Authorization', `Bearer ${token}`)
			.send({ username: 'to_update', email: 'update@test.com' });

		const userId = createRes.body.id;

		const res = await request(app)
			.patch(`/api/admin/users/${userId}`)
			.set('Authorization', `Bearer ${token}`)
			.send({ globalElo: 1800 });

		expect(res.status).toBe(200);
		expect(res.body.globalElo).toBe(1800);
	});
});

// ─────────────────────────────────────────────
// DELETE /api/admin/users/:id
// ─────────────────────────────────────────────
describe('DELETE /api/admin/users/:id', () => {
	test('soft-deletes user', async () => {
		const { token } = await registerAndLogin('admin');
		const createRes = await request(app)
			.post('/api/admin/users')
			.set('Authorization', `Bearer ${token}`)
			.send({ username: 'to_delete', email: 'delete@test.com' });

		const userId = createRes.body.id;

		const res = await request(app)
			.delete(`/api/admin/users/${userId}`)
			.set('Authorization', `Bearer ${token}`);

		expect(res.status).toBe(200);
		expect(res.body.isActive).toBe(false);
	});
});

// ─────────────────────────────────────────────
// PATCH /api/admin/users/:id/update_elo
// ─────────────────────────────────────────────
describe('PATCH /api/admin/users/:id/update_elo', () => {
	test('updates ELO rating', async () => {
		const { token } = await registerAndLogin('admin');
		const createRes = await request(app)
			.post('/api/admin/users')
			.set('Authorization', `Bearer ${token}`)
			.send({ username: 'elo_user', email: 'elo@test.com' });

		const userId = createRes.body.id;

		const res = await request(app)
			.patch(`/api/admin/users/${userId}/update_elo`)
			.set('Authorization', `Bearer ${token}`)
			.send({ globalElo: 2200 });

		expect(res.status).toBe(200);
		expect(res.body.globalElo).toBe(2200);
	});
});

// ─────────────────────────────────────────────
// POST /api/admin/users/import-csv
// ─────────────────────────────────────────────
describe('POST /api/admin/users/import-csv', () => {
	test('imports users from CSV', async () => {
		const { token } = await registerAndLogin('admin');

		const csv = 'username,email\ncsv_user1,csv1@test.com\ncsv_user2,csv2@test.com';
		const res = await request(app)
			.post('/api/admin/users/import-csv')
			.set('Authorization', `Bearer ${token}`)
			.send({ csv });

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.created).toBe(2);
	});

	test('rejects missing CSV content', async () => {
		const { token } = await registerAndLogin('admin');

		const res = await request(app)
			.post('/api/admin/users/import-csv')
			.set('Authorization', `Bearer ${token}`)
			.send({});

		expect(res.status).toBe(400);
		expect(res.body.error).toContain('CSV content is required');
	});
});
