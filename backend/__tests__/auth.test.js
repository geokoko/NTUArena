const { connect, clearDatabase, disconnect } = require('./setup');
const authService = require('../src/services/authService');
const User = require('../src/models/User');

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await disconnect());

// ─────────────────────────────────────────────
// 1. Regex Injection Prevention
// ─────────────────────────────────────────────
describe('Regex Injection Prevention', () => {
	const baseUser = {
		username: 'testuser',
		email: 'test@example.com',
		password: 'password123',
	};

	beforeEach(async () => {
		await authService.register(baseUser);
	});

	test('register should not match existing users via regex wildcard in username', async () => {
		// A regex wildcard like ".*" should be escaped and treated as a literal,
		// so this should succeed (different literal username)
		const result = await authService.register({
			username: '.*',
			email: 'other@example.com',
			password: 'password123',
		});
		expect(result.username).toBe('.*');
	});

	test('register should not match existing users via regex pattern in email', async () => {
		const result = await authService.register({
			username: 'otheruser',
			email: '.*@example.com',
			password: 'password123',
		});
		expect(result.username).toBe('otheruser');
	});

	test('login with regex wildcard username should not match real users', async () => {
		// ".*" as a username should NOT match "testuser"
		await expect(
			authService.login('.*', 'password123')
		).rejects.toThrow('Invalid credentials');
	});

	test('login with regex pattern should not match real users', async () => {
		await expect(
			authService.login('test.*', 'password123')
		).rejects.toThrow('Invalid credentials');
	});

	test('register should still reject truly duplicate usernames (case insensitive)', async () => {
		await expect(
			authService.register({
				username: 'TESTUSER',
				email: 'different@example.com',
				password: 'password123',
			})
		).rejects.toThrow('Username already taken');
	});

	test('register should still reject truly duplicate emails (case insensitive)', async () => {
		await expect(
			authService.register({
				username: 'differentuser',
				email: 'TEST@example.com',
				password: 'password123',
			})
		).rejects.toThrow('Email already registered');
	});

	test('login should work case-insensitively with valid credentials', async () => {
		const result = await authService.login('TESTUSER', 'password123');
		expect(result.user.username).toBe('testuser');
		expect(result.token).toBeDefined();
	});
});

// ─────────────────────────────────────────────
// 2. Role Escalation Prevention
// ─────────────────────────────────────────────
describe('Role Escalation Prevention', () => {
	test('register should ignore role field and always create player', async () => {
		const user = await authService.register({
			username: 'hacker',
			email: 'hacker@evil.com',
			password: 'password123',
			role: 'admin',  // Attempting privilege escalation
		});
		expect(user.role).toBe('player');
	});

	test('register should ignore spectator role as well', async () => {
		const user = await authService.register({
			username: 'spectator_attempt',
			email: 'spec@evil.com',
			password: 'password123',
			role: 'spectator',
		});
		expect(user.role).toBe('player');
	});

	test('register with no role field should default to player', async () => {
		const user = await authService.register({
			username: 'normaluser',
			email: 'normal@example.com',
			password: 'password123',
		});
		expect(user.role).toBe('player');
	});
});

// ─────────────────────────────────────────────
// 3. Token Verification
// ─────────────────────────────────────────────
describe('Token Verification', () => {
	test('valid token should decode correctly', async () => {
		const user = await authService.register({
			username: 'tokenuser',
			email: 'token@example.com',
			password: 'password123',
		});

		const { token } = await authService.login('tokenuser', 'password123');
		const decoded = authService.verifyToken(token);
		
		expect(decoded.userId).toBe(user.id);
		expect(decoded.role).toBe('player');
	});

	test('invalid token should throw', () => {
		expect(() => authService.verifyToken('invalid.token.here'))
			.toThrow('Invalid or expired token');
	});

	test('tampered token should throw', async () => {
		await authService.register({
			username: 'tamperuser',
			email: 'tamper@example.com',
			password: 'password123',
		});

		const { token } = await authService.login('tamperuser', 'password123');
		// Tamper with the token payload
		const parts = token.split('.');
		parts[1] = Buffer.from('{"userId":"fake","role":"admin"}').toString('base64url');
		const tamperedToken = parts.join('.');

		expect(() => authService.verifyToken(tamperedToken))
			.toThrow('Invalid or expired token');
	});

	test('getUserFromToken should return sanitized user', async () => {
		await authService.register({
			username: 'fromtokenuser',
			email: 'fromtoken@example.com',
			password: 'password123',
		});

		const { token } = await authService.login('fromtokenuser', 'password123');
		const user = await authService.getUserFromToken(token);
		
		expect(user.username).toBe('fromtokenuser');
		expect(user.role).toBe('player');
		// Should NOT contain passwordHash or _id
		expect(user.passwordHash).toBeUndefined();
		expect(user._id).toBeUndefined();
	});
});

// ─────────────────────────────────────────────
// 4. Input Validation
// ─────────────────────────────────────────────
describe('Input Validation', () => {
	test('register should reject missing username', async () => {
		await expect(
			authService.register({ email: 'x@x.com', password: 'password123' })
		).rejects.toThrow('Username, email, and password are required');
	});

	test('register should reject missing email', async () => {
		await expect(
			authService.register({ username: 'user', password: 'password123' })
		).rejects.toThrow('Username, email, and password are required');
	});

	test('register should reject missing password', async () => {
		await expect(
			authService.register({ username: 'user', email: 'x@x.com' })
		).rejects.toThrow('Username, email, and password are required');
	});

	test('register should reject short password', async () => {
		await expect(
			authService.register({ username: 'user', email: 'x@x.com', password: 'short' })
		).rejects.toThrow('Password must be at least 8 characters long');
	});

	test('login should reject missing identifier', async () => {
		await expect(
			authService.login(null, 'password123')
		).rejects.toThrow('Username/email and password are required');
	});

	test('login should reject missing password', async () => {
		await expect(
			authService.login('someuser', null)
		).rejects.toThrow('Username/email and password are required');
	});

	test('login should reject wrong password', async () => {
		await authService.register({
			username: 'wrongpwuser',
			email: 'wrongpw@example.com',
			password: 'password123',
		});

		await expect(
			authService.login('wrongpwuser', 'wrongpassword')
		).rejects.toThrow('Invalid credentials');
	});

	test('login should reject non-existent user', async () => {
		await expect(
			authService.login('nonexistent', 'password123')
		).rejects.toThrow('Invalid credentials');
	});

	test('login should reject deactivated user', async () => {
		await authService.register({
			username: 'deactivated',
			email: 'deactivated@example.com',
			password: 'password123',
		});

		// Deactivate the user directly in the database
		await User.updateOne({ username: 'deactivated' }, { isActive: false });

		await expect(
			authService.login('deactivated', 'password123')
		).rejects.toThrow('Account is deactivated');
	});
});
