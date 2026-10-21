const { lifecycleFields, performanceFields, migrateDatabase } = require('../scripts/migrateTournamentLifecycle');

const legacy = {
	_id: 'legacy', tournStatus: 'upcoming',
	startDate: new Date('2026-11-01T10:00:00Z'), endDate: new Date('2026-11-01T11:30:00Z'),
};

test('legacy upcoming tournaments remain manual regardless of their informational dates', () => {
	expect(lifecycleFields(legacy)).toEqual({ durationMs: 5400000, scheduledStartDate: null, actualStartDate: null });
});

test('legacy active tournaments keep their dates without inventing a new schedule', () => {
	expect(lifecycleFields({ ...legacy, tournStatus: 'in progress' })).toEqual({
		durationMs: 5400000, scheduledStartDate: null, actualStartDate: legacy.startDate,
	});
});

test.each([null, 'bad-date', new Date('2026-11-01T09:00:00Z')])('invalid legacy windows require correction', (endDate) => {
	expect(() => lifecycleFields({ ...legacy, endDate })).toThrow('valid legacy startDate/endDate');
});

test.each([1820, 0])('preserves the recorded historical performance %i', (liveRating) => {
	expect(performanceFields({ _id: 'player', gamesPlayed: 5, liveRating })).toEqual({ performanceRating: liveRating });
	expect(performanceFields({ _id: 'player', gamesPlayed: 5, liveRating, performanceRating: null })).toEqual({ performanceRating: liveRating });
});

test.each([1900, 0])('does not overwrite an existing performance rating %i', (performanceRating) => {
	expect(performanceFields({ gamesPlayed: 5, liveRating: 1820, performanceRating })).toBeNull();
});

test('initial entry-rating seeds are not historical performances', () => {
	expect(performanceFields({ gamesPlayed: 0, liveRating: 1500 })).toBeNull();
});

test.each([undefined, null, '1820', NaN, Infinity])('rejects invalid played-player ratings: %s', (liveRating) => {
	expect(() => performanceFields({ _id: 'player', gamesPlayed: 5, liveRating })).toThrow('numeric legacy liveRating');
});

function database(tournamentDocs, playerDocs) {
	const collection = (docs) => ({
		find: jest.fn(() => ({ toArray: async () => docs })),
		updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
	});
	const tournaments = collection(tournamentDocs);
	const players = collection(playerDocs);
	return { collection: (name) => ({ tournaments, players }[name]), tournaments, players };
}

test('dry run previews players even when tournament dates have already been migrated', async () => {
	const db = database([], [{ _id: 'completed-player', gamesPlayed: 5, liveRating: 1820 }]);
	const log = jest.fn();
	await migrateDatabase(db, { log });
	expect(log).toHaveBeenCalledWith('Player', 'completed-player', '{"performanceRating":1820}');
	expect(db.players.updateOne).not.toHaveBeenCalled();
	expect(db.tournaments.updateOne).not.toHaveBeenCalled();
});

test('application only fills an absent performance and retains the legacy field', async () => {
	const db = database([], [{ _id: 'player', gamesPlayed: 5, liveRating: 1820 }]);
	await migrateDatabase(db, { apply: true, log: jest.fn() });
	expect(db.players.find).toHaveBeenCalledWith({ performanceRating: null, liveRating: { $exists: true }, gamesPlayed: { $gt: 0 } });
	expect(db.players.updateOne).toHaveBeenCalledWith(
		{ _id: 'player', performanceRating: null, liveRating: 1820, gamesPlayed: 5 },
		{ $set: { performanceRating: 1820 } },
	);
});

test('invalid player data aborts before applying otherwise valid tournament changes', async () => {
	const db = database([legacy], [{ _id: 'bad-player', gamesPlayed: 5, liveRating: 'bad' }]);
	await expect(migrateDatabase(db, { apply: true, log: jest.fn() })).rejects.toThrow('bad-player');
	expect(db.tournaments.updateOne).not.toHaveBeenCalled();
	expect(db.players.updateOne).not.toHaveBeenCalled();
});
