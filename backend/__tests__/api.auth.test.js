process.env.JWT_SECRET = 'test-secret-for-unit-tests';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');
const { connect, clearDatabase, disconnect } = require('./setup');
const authService = require('../src/services/authService');

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await disconnect());

const registerUser = (data = {}) =>
	authService.register({
		username: 'testuser',
		email: 'test@example.com',
		password: 'password123',
		...data,
	});

// ─────────────────────────────────────────────
// GET /api/auth/status
// ─────────────────────────────────────────────
describe('GET /api/auth/status', () => {
	test('returns authEnabled flag', async () => {
		const res = await request(app).get('/api/auth/status');

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(typeof res.body.authEnabled).toBe('boolean');
	});
});

// ─────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────
describe('POST /api/auth/register', () => {
	test('registers a new user (201)', async () => {
		const res = await request(app)
			.post('/api/auth/register')
			.send({ username: 'newuser', email: 'new@test.com', password: 'password123' });

		expect(res.status).toBe(201);
		expect(res.body.success).toBe(true);
		expect(res.body.user.username).toBe('newuser');
		expect(res.body.user.role).toBe('player');
	});

	test('rejects duplicate username (500 from service error)', async () => {
		await registerUser();
		const res = await request(app)
			.post('/api/auth/register')
			.send({ username: 'testuser', email: 'other@test.com', password: 'password123' });

		expect(res.status).toBe(500);
		expect(res.body.error).toContain('Username already taken');
	});

	test('rejects missing fields (500 from service error)', async () => {
		const res = await request(app)
			.post('/api/auth/register')
			.send({ username: 'onlyuser' });

		expect(res.status).toBe(500);
		expect(res.body.error).toContain('required');
	});

	test('rejects short password', async () => {
		const res = await request(app)
			.post('/api/auth/register')
			.send({ username: 'shortpw', email: 'short@test.com', password: 'short' });

		expect(res.status).toBe(500);
		expect(res.body.error).toContain('at least 8');
	});
});

// ─────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────
describe('POST /api/auth/login', () => {
	test('logs in with valid credentials (200)', async () => {
		await registerUser();
		const res = await request(app)
			.post('/api/auth/login')
			.send({ username: 'testuser', password: 'password123' });

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.token).toBeDefined();
		expect(res.body.user.username).toBe('testuser');
	});

	test('rejects wrong password', async () => {
		await registerUser();
		const res = await request(app)
			.post('/api/auth/login')
			.send({ username: 'testuser', password: 'wrongpassword' });

		expect(res.status).toBe(500);
		expect(res.body.error).toContain('Invalid credentials');
	});

	test('rejects non-existent user', async () => {
		const res = await request(app)
			.post('/api/auth/login')
			.send({ username: 'nobody', password: 'password123' });

		expect(res.status).toBe(500);
		expect(res.body.error).toContain('Invalid credentials');
	});
});

// ─────────────────────────────────────────────
// GET /api/auth/me
// ─────────────────────────────────────────────
describe('GET /api/auth/me', () => {
	test('returns user profile with valid token', async () => {
		await registerUser();
		const { token } = await authService.login('testuser', 'password123');

		const res = await request(app)
			.get('/api/auth/me')
			.set('Authorization', `Bearer ${token}`);

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.user.username).toBe('testuser');
		expect(res.body.user.role).toBe('player');
	});

	test('returns 401 without token', async () => {
		const res = await request(app).get('/api/auth/me');

		expect(res.status).toBe(401);
		expect(res.body.error).toContain('Authentication required');
	});

	test('returns 401 with invalid token', async () => {
		const res = await request(app)
			.get('/api/auth/me')
			.set('Authorization', 'Bearer invalid.token.here');

		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────
// 404 Handling
// ─────────────────────────────────────────────
describe('404 handling', () => {
	test('returns 404 for unknown routes', async () => {
		const res = await request(app).get('/api/nonexistent');
		expect(res.status).toBe(404);
	});
});

// ─────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────
describe('GET /health', () => {
	test('returns 200 with status OK', async () => {
		const res = await request(app).get('/health');

		expect(res.status).toBe(200);
		expect(res.body.status).toBe('OK');
		expect(res.body.service).toBe('arena-monolith');
	});
});
