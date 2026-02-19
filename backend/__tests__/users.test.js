const { connect, clearDatabase, disconnect } = require('./setup');
const userService = require('../src/services/userService');
const User = require('../src/models/User');

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await disconnect());

// Helper
const createUser = (overrides = {}) =>
	userService.addUser({
		username: `user${Date.now()}`,
		email: `user${Date.now()}@test.com`,
		role: 'player',
		...overrides,
	});

// ─────────────────────────────────────────────
// getAllUsers
// ─────────────────────────────────────────────
describe('getAllUsers', () => {
	test('returns empty array when no users', async () => {
		const users = await userService.getAllUsers();
		expect(users).toEqual([]);
	});

	test('returns sanitized users (no passwordHash or _id)', async () => {
		await createUser({ username: 'alice', email: 'alice@test.com' });
		const users = await userService.getAllUsers();

		expect(users).toHaveLength(1);
		expect(users[0].username).toBe('alice');
		expect(users[0].id).toBeDefined();
		expect(users[0].passwordHash).toBeUndefined();
		expect(users[0]._id).toBeUndefined();
	});

	test('excludes soft-deleted users', async () => {
		const user = await createUser({ username: 'deleted', email: 'del@test.com' });
		await userService.deleteUser(user.id);

		const users = await userService.getAllUsers();
		expect(users).toHaveLength(0);
	});
});

// ─────────────────────────────────────────────
// getUserById
// ─────────────────────────────────────────────
describe('getUserById', () => {
	test('returns user by publicId', async () => {
		const created = await createUser({ username: 'findme', email: 'find@test.com' });
		const found = await userService.getUserById(created.id);

		expect(found.username).toBe('findme');
	});

	test('throws for non-existent id', async () => {
		await expect(userService.getUserById('nonexistent')).rejects.toThrow('User not found');
	});

	test('throws for deleted user', async () => {
		const user = await createUser({ username: 'deluser', email: 'deluser@test.com' });
		await userService.deleteUser(user.id);

		await expect(userService.getUserById(user.id)).rejects.toThrow('User not found');
	});
});

// ─────────────────────────────────────────────
// addUser
// ─────────────────────────────────────────────
describe('addUser', () => {
	test('creates a user with valid data', async () => {
		const user = await userService.addUser({
			username: 'newuser',
			email: 'new@test.com',
			role: 'player',
		});

		expect(user.username).toBe('newuser');
		expect(user.email).toBe('new@test.com');
		expect(user.role).toBe('player');
		expect(user.id).toBeDefined();
	});

	test('creates admin user when role=admin', async () => {
		const user = await userService.addUser({
			username: 'admin',
			email: 'admin@test.com',
			role: 'admin',
		});

		expect(user.role).toBe('admin');
	});

	test('sets default globalElo to 0', async () => {
		const user = await createUser({ username: 'noelo', email: 'noelo@test.com' });
		expect(user.globalElo).toBe(0);
	});

	test('accepts profile with firstName and lastName', async () => {
		const user = await userService.addUser({
			username: 'profiled',
			email: 'profile@test.com',
			profile: { firstName: 'John', lastName: 'Doe' },
		});

		expect(user.profile.firstName).toBe('John');
		expect(user.profile.lastName).toBe('Doe');
	});
});

// ─────────────────────────────────────────────
// updateUser
// ─────────────────────────────────────────────
describe('updateUser', () => {
	test('updates username', async () => {
		const user = await createUser({ username: 'original', email: 'orig@test.com' });
		const updated = await userService.updateUser(user.id, { username: 'updated' });

		expect(updated.username).toBe('updated');
	});

	test('updates globalElo', async () => {
		const user = await createUser({ username: 'elo_user', email: 'elo@test.com' });
		const updated = await userService.updateUser(user.id, { globalElo: 1500 });

		expect(updated.globalElo).toBe(1500);
	});

	test('throws for non-existent user', async () => {
		await expect(
			userService.updateUser('nonexistent', { username: 'x' })
		).rejects.toThrow('User not found');
	});

	test('rejects non-finite globalElo', async () => {
		const user = await createUser({ username: 'badelo', email: 'badelo@test.com' });
		await expect(
			userService.updateUser(user.id, { globalElo: 'not-a-number' })
		).rejects.toThrow('globalElo must be a finite number');
	});
});

// ─────────────────────────────────────────────
// deleteUser
// ─────────────────────────────────────────────
describe('deleteUser', () => {
	test('soft-deletes user (sets isDeleted and isActive)', async () => {
		const user = await createUser({ username: 'todelete', email: 'todelete@test.com' });
		const deleted = await userService.deleteUser(user.id);

		expect(deleted.isActive).toBe(false);

		// Verify in DB
		const dbUser = await User.findOne({ username: 'todelete' });
		expect(dbUser.isDeleted).toBe(true);
		expect(dbUser.isActive).toBe(false);
		expect(dbUser.deletedAt).toBeDefined();
	});

	test('throws for non-existent user', async () => {
		await expect(userService.deleteUser('nonexistent')).rejects.toThrow('User not found');
	});
});

// ─────────────────────────────────────────────
// updateUserElo
// ─────────────────────────────────────────────
describe('updateUserElo', () => {
	test('updates ELO rating', async () => {
		const user = await createUser({ username: 'elo', email: 'eloup@test.com' });
		const updated = await userService.updateUserElo(user.id, 2000);

		expect(updated.globalElo).toBe(2000);
	});

	test('throws for non-existent user', async () => {
		await expect(userService.updateUserElo('nonexistent', 1000)).rejects.toThrow('User not found');
	});
});

// ─────────────────────────────────────────────
// bulkAddUsers
// ─────────────────────────────────────────────
describe('bulkAddUsers', () => {
	test('creates multiple users from CSV data', async () => {
		const results = await userService.bulkAddUsers([
			{ username: 'bulk1', email: 'bulk1@test.com', _rowNumber: 2 },
			{ username: 'bulk2', email: 'bulk2@test.com', _rowNumber: 3 },
		]);

		expect(results.created).toHaveLength(2);
		expect(results.skipped).toHaveLength(0);
		expect(results.errors).toHaveLength(0);
	});

	test('skips duplicate usernames', async () => {
		await createUser({ username: 'existing', email: 'existing@test.com' });

		const results = await userService.bulkAddUsers([
			{ username: 'existing', email: 'new@test.com', _rowNumber: 2 },
		]);

		expect(results.created).toHaveLength(0);
		expect(results.skipped).toHaveLength(1);
		expect(results.skipped[0].reason).toContain('already exists');
	});

	test('skips duplicate emails', async () => {
		await createUser({ username: 'emailuser', email: 'dupe@test.com' });

		const results = await userService.bulkAddUsers([
			{ username: 'newuser', email: 'dupe@test.com', _rowNumber: 2 },
		]);

		expect(results.skipped).toHaveLength(1);
	});

	test('returns empty results for empty array', async () => {
		const results = await userService.bulkAddUsers([]);
		expect(results.created).toHaveLength(0);
	});

	test('detects in-batch duplicates', async () => {
		const results = await userService.bulkAddUsers([
			{ username: 'batchdup', email: 'batch1@test.com', _rowNumber: 2 },
			{ username: 'batchdup', email: 'batch2@test.com', _rowNumber: 3 },
		]);

		expect(results.created).toHaveLength(1);
		expect(results.skipped).toHaveLength(1);
	});
});

// ─────────────────────────────────────────────
// filterData
// ─────────────────────────────────────────────
describe('filterData', () => {
	test('filters out unknown fields', () => {
		const result = userService.filterData({
			username: 'test',
			email: 'test@x.com',
			malicious: 'payload',
		});

		expect(result.username).toBe('test');
		expect(result.malicious).toBeUndefined();
	});

	test('handles null/undefined input gracefully', () => {
		expect(userService.filterData(null)).toEqual({});
		expect(userService.filterData(undefined)).toEqual({});
	});

	test('parses globalElo as number', () => {
		const result = userService.filterData({ globalElo: '1500' });
		expect(result.globalElo).toBe(1500);
	});

	test('picks up firstName/lastName from top level', () => {
		const result = userService.filterData({ firstName: 'John', lastName: 'Doe' });
		expect(result.profile.firstName).toBe('John');
		expect(result.profile.lastName).toBe('Doe');
	});
});
