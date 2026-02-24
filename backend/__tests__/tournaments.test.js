const { connect, clearDatabase, disconnect } = require('./setup');
const tournamentService = require('../src/services/tournamentService');
const userService = require('../src/services/userService');
const User = require('../src/models/User');
const Tournament = require('../src/models/Tournament');
const Player = require('../src/models/Player');

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

const createTestTournament = async (overrides = {}) =>
	tournamentService.createTournament({
		name: 'Test Tournament',
		startDate: tomorrow(),
		endDate: dayAfter(),
		...overrides,
	});

// ─────────────────────────────────────────────
// createTournament
// ─────────────────────────────────────────────
describe('createTournament', () => {
	test('creates tournament with valid data', async () => {
		const t = await createTestTournament({ name: 'Arena Cup' });

		expect(t.name).toBe('Arena Cup');
		expect(t.tournStatus).toBe('upcoming');
		expect(t.id).toBeDefined();
	});

	test('rejects missing name', async () => {
		await expect(
			createTestTournament({ name: '' })
		).rejects.toThrow('Tournament name is required');
	});

	test('rejects missing dates', async () => {
		await expect(
			tournamentService.createTournament({ name: 'No Dates' })
		).rejects.toThrow('startDate and endDate are required');
	});

	test('rejects startDate after endDate', async () => {
		await expect(
			createTestTournament({ startDate: dayAfter(), endDate: tomorrow() })
		).rejects.toThrow('startDate must be before endDate');
	});

	test('rejects invalid maxPlayers', async () => {
		await expect(
			createTestTournament({ maxPlayers: -5 })
		).rejects.toThrow('maxPlayers must be a positive number');
	});

	test('defaults maxPlayers to 100', async () => {
		const t = await createTestTournament();
		expect(t.maxPlayers).toBe(100);
	});

	test('accepts title as alias for name', async () => {
		const t = await tournamentService.createTournament({
			title: 'Via Title',
			startDate: tomorrow(),
			endDate: dayAfter(),
		});
		expect(t.name).toBe('Via Title');
	});
});

// ─────────────────────────────────────────────
// getAllTournaments
// ─────────────────────────────────────────────
describe('getAllTournaments', () => {
	test('returns empty array when none exist', async () => {
		const list = await tournamentService.getAllTournaments();
		expect(list).toEqual([]);
	});

	test('returns sanitized tournament list', async () => {
		await createTestTournament({ name: 'T1' });
		await createTestTournament({ name: 'T2' });

		const list = await tournamentService.getAllTournaments();
		expect(list).toHaveLength(2);
		expect(list[0].id).toBeDefined();
		expect(list[0]._id).toBeUndefined();
	});
});

// ─────────────────────────────────────────────
// getTournamentById
// ─────────────────────────────────────────────
describe('getTournamentById', () => {
	test('returns full tournament with participants and games', async () => {
		const t = await createTestTournament();
		const result = await tournamentService.getTournamentById(t.id);

		expect(result.name).toBe('Test Tournament');
		expect(result.participants).toBeDefined();
		expect(result.games).toBeDefined();
	});

	test('throws for non-existent tournament', async () => {
		await expect(
			tournamentService.getTournamentById('nonexistent')
		).rejects.toThrow('Tournament not found');
	});
});

// ─────────────────────────────────────────────
// updateTournament
// ─────────────────────────────────────────────
describe('updateTournament', () => {
	test('updates name', async () => {
		const t = await createTestTournament();
		const updated = await tournamentService.updateTournament(t.id, { name: 'Updated Name' });

		expect(updated.name).toBe('Updated Name');
	});

	test('rejects empty update body', async () => {
		const t = await createTestTournament();
		await expect(
			tournamentService.updateTournament(t.id, {})
		).rejects.toThrow('No valid fields');
	});

	test('rejects non-existent tournament', async () => {
		await expect(
			tournamentService.updateTournament('nonexistent', { name: 'x' })
		).rejects.toThrow('Tournament not found');
	});

	test('rejects startDate after endDate on update', async () => {
		const t = await createTestTournament();
		const farFuture = new Date();
		farFuture.setFullYear(farFuture.getFullYear() + 10);

		await expect(
			tournamentService.updateTournament(t.id, { startDate: farFuture.toISOString() })
		).rejects.toThrow('startDate must be before endDate');
	});
});

// ─────────────────────────────────────────────
// deleteTournament
// ─────────────────────────────────────────────
describe('deleteTournament', () => {
	test('deletes upcoming tournament and its players/games', async () => {
		const t = await createTestTournament();
		const result = await tournamentService.deleteTournament(t.id);

		expect(result.message).toContain('deleted');
		await expect(
			tournamentService.getTournamentById(t.id)
		).rejects.toThrow('Tournament not found');
	});

	test('rejects deletion of in-progress tournament', async () => {
		const t = await createTestTournament();
		// Start the tournament
		await tournamentService.startTournament(t.id);

		await expect(
			tournamentService.deleteTournament(t.id)
		).rejects.toThrow('Cannot delete an in-progress tournament');
	});

	test('throws for non-existent tournament', async () => {
		await expect(
			tournamentService.deleteTournament('nonexistent')
		).rejects.toThrow('Tournament not found');
	});
});

// ─────────────────────────────────────────────
// startTournament / endTournament
// ─────────────────────────────────────────────
describe('startTournament', () => {
	test('transitions status to in progress', async () => {
		const t = await createTestTournament();
		const started = await tournamentService.startTournament(t.id);

		expect(started.tournStatus).toBe('in progress');
	});

	test('rejects starting an already started tournament', async () => {
		const t = await createTestTournament();
		await tournamentService.startTournament(t.id);

		await expect(
			tournamentService.startTournament(t.id)
		).rejects.toThrow('already started or completed');
	});
});

describe('endTournament', () => {
	test('transitions status to completed', async () => {
		const t = await createTestTournament();
		await tournamentService.startTournament(t.id);
		const ended = await tournamentService.endTournament(t.id);

		expect(ended.tournStatus).toBe('completed');
	});

	test('rejects ending a non-in-progress tournament', async () => {
		const t = await createTestTournament();
		await expect(
			tournamentService.endTournament(t.id)
		).rejects.toThrow('not in progress');
	});
});

// ─────────────────────────────────────────────
// joinTournament
// ─────────────────────────────────────────────
describe('joinTournament', () => {
	test('creates player entry with user ELO as seed', async () => {
		const user = await createTestUser({ globalElo: 1500 });
		const t = await createTestTournament();

		const player = await tournamentService.joinTournament(user.id, t.id);

		expect(player.userId).toBe(user.id);
		expect(player.entryRating).toBe(1500);
		expect(player.liveRating).toBe(1500);
		expect(player.score).toBe(0);
	});

	test('rejects joining completed tournament', async () => {
		const user = await createTestUser();
		const t = await createTestTournament();
		await tournamentService.startTournament(t.id);
		await tournamentService.endTournament(t.id);

		await expect(
			tournamentService.joinTournament(user.id, t.id)
		).rejects.toThrow('already completed');
	});

	test('rejects duplicate join', async () => {
		const user = await createTestUser();
		const t = await createTestTournament();

		await tournamentService.joinTournament(user.id, t.id);
		await expect(
			tournamentService.joinTournament(user.id, t.id)
		).rejects.toThrow('already joined');
	});

	test('rejects when tournament is full', async () => {
		const t = await createTestTournament({ maxPlayers: 1 });
		const user1 = await createTestUser();
		const user2 = await createTestUser();

		await tournamentService.joinTournament(user1.id, t.id);
		await expect(
			tournamentService.joinTournament(user2.id, t.id)
		).rejects.toThrow('full');
	});

	test('handles user with no ELO (defaults to 0)', async () => {
		const user = await createTestUser();
		const t = await createTestTournament();

		const player = await tournamentService.joinTournament(user.id, t.id);
		expect(player.entryRating).toBe(0);
	});
});

// ─────────────────────────────────────────────
// leaveTournament
// ─────────────────────────────────────────────
describe('leaveTournament', () => {
	test('withdraws player from tournament', async () => {
		const user = await createTestUser();
		const t = await createTestTournament();
		await tournamentService.joinTournament(user.id, t.id);

		const result = await tournamentService.leaveTournament(user.id, t.id);

		expect(result.message).toContain('withdrawn');
		expect(result.player.status).toBe('withdrawn');
	});

	test('rejects leaving when not in tournament', async () => {
		const user = await createTestUser();
		const t = await createTestTournament();

		await expect(
			tournamentService.leaveTournament(user.id, t.id)
		).rejects.toThrow('Player not found');
	});
});

// ─────────────────────────────────────────────
// pausePlayer / resumePlayer
// ─────────────────────────────────────────────
describe('pausePlayer', () => {
	test('pauses active player', async () => {
		const user = await createTestUser();
		const t = await createTestTournament();
		await tournamentService.joinTournament(user.id, t.id);

		const paused = await tournamentService.pausePlayer(user.id, t.id);
		expect(paused.status).toBe('paused');
	});

	test('rejects pausing withdrawn player', async () => {
		const user = await createTestUser();
		const t = await createTestTournament();
		await tournamentService.joinTournament(user.id, t.id);
		await tournamentService.leaveTournament(user.id, t.id);

		await expect(
			tournamentService.pausePlayer(user.id, t.id)
		).rejects.toThrow('already withdrawn');
	});
});

describe('resumePlayer', () => {
	test('resumes paused player', async () => {
		const user = await createTestUser();
		const t = await createTestTournament();
		await tournamentService.joinTournament(user.id, t.id);
		await tournamentService.pausePlayer(user.id, t.id);

		const resumed = await tournamentService.resumePlayer(user.id, t.id);
		expect(resumed.status).toBe('active');
	});

	test('rejects resuming withdrawn player', async () => {
		const user = await createTestUser();
		const t = await createTestTournament();
		await tournamentService.joinTournament(user.id, t.id);
		await tournamentService.leaveTournament(user.id, t.id);

		await expect(
			tournamentService.resumePlayer(user.id, t.id)
		).rejects.toThrow('Withdrawn players cannot be resumed');
	});
});

// ─────────────────────────────────────────────
// getTournamentPlayers / getTournamentStandings
// ─────────────────────────────────────────────
describe('getTournamentPlayers', () => {
	test('returns players sorted by score', async () => {
		const t = await createTestTournament();
		const user1 = await createTestUser({ globalElo: 1500 });
		const user2 = await createTestUser({ globalElo: 2000 });

		await tournamentService.joinTournament(user1.id, t.id);
		await tournamentService.joinTournament(user2.id, t.id);

		const players = await tournamentService.getTournamentPlayers(t.id);
		expect(players).toHaveLength(2);
		// sorted by score (both 0), then by liveRating desc (2000 first)
		expect(players[0].liveRating).toBe(2000);
	});

	test('throws for non-existent tournament', async () => {
		await expect(
			tournamentService.getTournamentPlayers('nonexistent')
		).rejects.toThrow('Tournament not found');
	});
});

describe('getTournamentStandings', () => {
	test('returns standings with rank', async () => {
		const t = await createTestTournament();
		const user = await createTestUser({ globalElo: 1500 });
		await tournamentService.joinTournament(user.id, t.id);

		const standings = await tournamentService.getTournamentStandings(t.id);
		expect(standings).toHaveLength(1);
		expect(standings[0].rank).toBe(1);
		expect(standings[0].score).toBe(0);
		expect(standings[0].player.username).toBeDefined();
	});
});

// ─────────────────────────────────────────────
// getTournamentGames
// ─────────────────────────────────────────────
describe('getTournamentGames', () => {
	test('returns empty array when no games', async () => {
		const t = await createTestTournament();
		const games = await tournamentService.getTournamentGames(t.id);
		expect(games).toEqual([]);
	});

	test('throws for non-existent tournament', async () => {
		await expect(
			tournamentService.getTournamentGames('nonexistent')
		).rejects.toThrow('Tournament not found');
	});
});
