// Set required env variables before importing any app modules
process.env.JWT_SECRET = 'test-secret-for-unit-tests';
process.env.NODE_ENV = 'test';

const jwt = require('jsonwebtoken');
const { connect, clearDatabase, disconnect } = require('./setup');
const User = require('../src/models/User');

// We need to test the middleware functions directly
// Import after JWT_SECRET is set
const { requireAuth, requireRole, AUTH_ENABLED } = require('../src/middleware/auth');

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await disconnect());

// Helper to create mock req/res/next
const mockReqResNext = (overrides = {}) => {
	const req = {
		headers: {},
		user: null,
		...overrides,
	};
	const res = {
		_status: 200,
		_json: null,
		status(code) { this._status = code; return this; },
		json(data) { this._json = data; return this; },
	};
	const next = jest.fn();
	return { req, res, next };
};

// ─────────────────────────────────────────────
// requireAuth
// ─────────────────────────────────────────────
describe('requireAuth middleware', () => {
	let testUser;
	let validToken;

	beforeEach(async () => {
		testUser = await User.create({
			username: 'authtest',
			email: 'auth@test.com',
			passwordHash: 'hash',
			role: 'player',
			isActive: true,
		});

		validToken = jwt.sign(
			{ userId: testUser.publicId || testUser._id.toString(), role: testUser.role },
			process.env.JWT_SECRET,
			{ expiresIn: '1h' }
		);
	});

	test('should pass with valid Bearer token', async () => {
		const { req, res, next } = mockReqResNext({
			headers: { authorization: `Bearer ${validToken}` },
		});

		await requireAuth(req, res, next);

		expect(next).toHaveBeenCalled();
		expect(req.user).toBeDefined();
		expect(req.user.username).toBe('authtest');
	});

	test('should return 401 when no Authorization header', async () => {
		const { req, res, next } = mockReqResNext();

		await requireAuth(req, res, next);

		expect(res._status).toBe(401);
		expect(res._json.error).toContain('Authentication required');
		expect(next).not.toHaveBeenCalled();
	});

	test('should return 401 for malformed Authorization header', async () => {
		const { req, res, next } = mockReqResNext({
			headers: { authorization: 'NotBearer token' },
		});

		await requireAuth(req, res, next);

		expect(res._status).toBe(401);
		expect(next).not.toHaveBeenCalled();
	});

	test('should return 401 for invalid token', async () => {
		const { req, res, next } = mockReqResNext({
			headers: { authorization: 'Bearer invalid.jwt.token' },
		});

		await requireAuth(req, res, next);

		expect(res._status).toBe(401);
		expect(res._json.error).toContain('Invalid token');
	});

	test('should return 401 for deactivated user', async () => {
		await User.updateOne({ _id: testUser._id }, { isActive: false });

		const { req, res, next } = mockReqResNext({
			headers: { authorization: `Bearer ${validToken}` },
		});

		await requireAuth(req, res, next);

		expect(res._status).toBe(401);
		expect(res._json.error).toContain('deactivated');
	});

	test('should return 401 for deleted user', async () => {
		await User.updateOne({ _id: testUser._id }, { isDeleted: true });

		const { req, res, next } = mockReqResNext({
			headers: { authorization: `Bearer ${validToken}` },
		});

		await requireAuth(req, res, next);

		expect(res._status).toBe(401);
		expect(res._json.error).toContain('not found');
	});
});

// ─────────────────────────────────────────────
// requireRole
// ─────────────────────────────────────────────
describe('requireRole middleware', () => {
	test('should pass when user has required role', () => {
		const middleware = requireRole('admin');
		const { req, res, next } = mockReqResNext({
			user: { role: 'admin' },
		});

		middleware(req, res, next);

		expect(next).toHaveBeenCalled();
	});

	test('should return 403 when user lacks required role', () => {
		const middleware = requireRole('admin');
		const { req, res, next } = mockReqResNext({
			user: { role: 'player' },
		});

		middleware(req, res, next);

		expect(res._status).toBe(403);
		expect(res._json.error).toContain('Access denied');
		expect(next).not.toHaveBeenCalled();
	});

	test('should return 401 when no user on request', () => {
		const middleware = requireRole('admin');
		const { req, res, next } = mockReqResNext();

		middleware(req, res, next);

		expect(res._status).toBe(401);
	});

	test('should accept multiple roles', () => {
		const middleware = requireRole('admin', 'spectator');
		const { req, res, next } = mockReqResNext({
			user: { role: 'spectator' },
		});

		middleware(req, res, next);

		expect(next).toHaveBeenCalled();
	});
});
