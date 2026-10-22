const { connect, clearDatabase, disconnect } = require('./setup');
const Tournament = require('../src/models/Tournament');
const Player = require('../src/models/Player');
const Game = require('../src/models/Game');
const tournamentService = require('../src/services/tournamentService');
const gameService = require('../src/services/gameService');
const mongoose = require('mongoose');
const { migrateDatabase } = require('../scripts/migrateTournamentLifecycle');

beforeAll(connect);
afterEach(clearDatabase);
afterAll(disconnect);

async function playingTournament() {
	const tournament = await Tournament.create({ name: 'Lifecycle', durationMs: 60000 });
	const players = await Player.create([
		{ tournament: tournament._id, tempName: 'White', entryRating: 1500 },
		{ tournament: tournament._id, tempName: 'Black', entryRating: 1600 },
	]);
	await Game.init();
	await tournamentService.startTournament(tournament._id);
	const game = await gameService.createGameFromPairing(players[0]._id, players[1]._id, tournament._id);
	return { tournament, players, game };
}

test('closing pairing lets the last result settle and then completes', async () => {
	const { tournament, players, game } = await playingTournament();
	expect((await tournamentService.endTournament(tournament._id)).tournStatus).toBe('finishing');
	await expect(gameService.createGameFromPairing(players[0]._id, players[1]._id, tournament._id)).rejects.toThrow('pairing is closed');
	const result = await gameService.submitGameResult(game._id, '1-0');
	expect(result).toMatchObject({ isFinished: true, resultColor: 'white', boardNumber: 1 });
	expect((await Tournament.findById(tournament._id)).tournStatus).toBe('completed');
	expect((await Player.findById(players[0]._id)).score).toBe(1);
});

test('pausing a player cancels the game and rolls back pairing history', async () => {
	const { tournament, players, game } = await playingTournament();
	const paused = await tournamentService.pausePlayer(players[0]._id, tournament._id);
	expect(paused).toMatchObject({ status: 'paused', isPlaying: false });
	expect((await Game.findById(game._id)).isCancelled).toBe(true);
	for (const player of await Player.find({ tournament: tournament._id })) {
		expect(player.isPlaying).toBe(false);
		expect(player.recentOpponents).toHaveLength(0);
		expect(player.colorHistory).toHaveLength(0);
		expect(player.score).toBe(0);
	}
});

test('cancelling the last game completes a finishing tournament', async () => {
	const { tournament, game } = await playingTournament();
	await tournamentService.endTournament(tournament._id);
	await gameService.cancelGame(game._id);
	expect((await Tournament.findById(tournament._id)).tournStatus).toBe('completed');
});

test('a concurrent pairing and end transition leave no games in a completed tournament', async () => {
	const { tournament, players, game } = await playingTournament();
	await gameService.cancelGame(game._id);
	await Promise.allSettled([
		gameService.createGameFromPairing(players[0]._id, players[1]._id, tournament._id),
		tournamentService.endTournament(tournament._id),
	]);
	const saved = await Tournament.findById(tournament._id);
	const activeGames = await Game.countDocuments({ tournament: tournament._id, isFinished: false });
	expect(saved.tournStatus).toBe(activeGames ? 'finishing' : 'completed');
});

test('legacy performances survive migration and preserve completed standings on repeated runs', async () => {
	const tournament = await Tournament.create({ name: 'History', durationMs: 3600000, tournStatus: 'completed' });
	const players = await Player.create([
		{ tournament: tournament._id, tempName: 'Alice', score: 3, gamesPlayed: 5, entryRating: 1500 },
		{ tournament: tournament._id, tempName: 'Bob', score: 3, gamesPlayed: 5, entryRating: 1600 },
		{ tournament: tournament._id, tempName: 'Unplayed', gamesPlayed: 0, entryRating: 1700 },
		{ tournament: tournament._id, tempName: 'Current', gamesPlayed: 5, performanceRating: 1900 },
		{ tournament: tournament._id, tempName: 'Zero', gamesPlayed: 5 },
	]);
	for (const [index, liveRating] of [1820, 1750, 1700, 1300, 0].entries()) {
		await Player.collection.updateOne({ _id: players[index]._id }, { $set: { liveRating } });
	}
	await Player.collection.updateOne({ _id: players[0]._id }, { $unset: { performanceRating: '' } });
	const options = { log: jest.fn() };
	await migrateDatabase(mongoose.connection, options);
	expect((await Player.findById(players[0]._id)).performanceRating).toBeNull();
	await migrateDatabase(mongoose.connection, { ...options, apply: true });
	await migrateDatabase(mongoose.connection, { ...options, apply: true });
	const saved = await Player.find({ tournament: tournament._id }).sort({ score: -1, performanceRating: -1, entryRating: -1 });
	expect(saved.slice(0, 2).map((player) => player.tempName)).toEqual(['Alice', 'Bob']);
	const performances = Object.fromEntries(saved.map((player) => [player.tempName, player.performanceRating]));
	expect(performances).toEqual({ Alice: 1820, Bob: 1750, Unplayed: null, Current: 1900, Zero: 0 });
	expect((await Player.collection.findOne({ _id: players[0]._id })).liveRating).toBe(1820);
});

test('withdrawal preserves a participant registered after the initial read', async () => {
	const { tournament, players } = await playingTournament();
	await Tournament.updateOne({ _id: tournament._id }, { $set: { participants: players.map((p) => p._id) } });
	const newcomer = await require('../src/models/User').create({ username: 'newcomer', email: 'new@example.com' });
	const cancel = gameService.cancelActiveGameForPlayer.bind(gameService);
	const spy = jest.spyOn(gameService, 'cancelActiveGameForPlayer').mockImplementationOnce(async (...args) => {
		await tournamentService.joinTournament(newcomer._id, tournament._id);
		return cancel(...args);
	});
	try {
		await tournamentService.leaveTournament(players[0]._id, tournament._id);
		const saved = await Tournament.findById(tournament._id);
		const joined = await Player.findOne({ user: newcomer._id, tournament: tournament._id });
		expect(saved.participants.map(String)).toEqual(expect.arrayContaining([String(joined._id), String(players[1]._id)]));
		expect(saved.participants).toHaveLength(2);
	} finally { spy.mockRestore(); }
});

test.each(['pausePlayer', 'leaveTournament'])('%s cancels a pairing committed after the player was read', async (action) => {
	const tournament = await Tournament.create({ name: 'Race', durationMs: 60000, tournStatus: 'in progress' });
	const players = await Player.create([{ tournament: tournament._id }, { tournament: tournament._id }]);
	await Game.init();
	const save = Player.prototype.save;
	let inserted = false;
	const spy = jest.spyOn(Player.prototype, 'save').mockImplementation(async function (...args) {
		if (!inserted && String(this._id) === String(players[0]._id) && this.isModified('status')) {
			inserted = true;
			await gameService.createGameFromPairing(players[0]._id, players[1]._id, tournament._id);
		}
		return save.apply(this, args);
	});
	try {
		await tournamentService[action](players[0]._id, tournament._id);
		expect(inserted).toBe(true);
		expect(await Game.countDocuments({ tournament: tournament._id, isFinished: false })).toBe(0);
		for (const player of await Player.find({ tournament: tournament._id })) {
			expect(player.isPlaying).toBe(false);
			expect(player.recentOpponents).toHaveLength(0);
		}
	} finally { spy.mockRestore(); }
});

test.each(['user', 'csv'])('%s registration across automatic start waits for pairing', async (kind) => {
	const tournament = await Tournament.create({ name: 'Kickoff', durationMs: 60000 });
	const user = await require('../src/models/User').create({ username: 'late', email: 'late@example.com' });
	const save = Player.prototype.save;
	const spy = jest.spyOn(Player.prototype, 'save').mockImplementationOnce(async function (...args) {
		await tournamentService.startTournament(tournament._id);
		return save.apply(this, args);
	});
	try {
		if (kind === 'user') await tournamentService.joinTournament(user._id, tournament._id);
		else expect((await tournamentService.bulkAddPlayersFromCSV(tournament._id, [{ name: 'Guest', rating: 1400 }])).errors).toEqual([]);
		const registered = await Player.findOne({ tournament: tournament._id });
		expect(registered).toMatchObject({ status: 'active', isPlaying: false, waitingSince: expect.any(Date) });
	} finally { spy.mockRestore(); }
});

test.each(['result', 'cancel'])('%s rolls back the game claim and both players after a save failure', async (operation) => {
	const { game, players } = await playingTournament();
	const save = Player.prototype.save;
	const spy = jest.spyOn(Player.prototype, 'save').mockImplementation(function (...args) {
		if (String(this._id) === String(players[1]._id)) throw new Error('injected save failure');
		return save.apply(this, args);
	});
	const settle = () => operation === 'result' ? gameService.submitGameResult(game._id, 'white') : gameService.cancelGame(game._id);
	try { await expect(settle()).rejects.toThrow('injected save failure'); }
	finally { spy.mockRestore(); }
	expect((await Game.findById(game._id)).isFinished).toBe(false);
	for (const player of await Player.find({ tournament: game.tournament })) {
		expect(player.score).toBe(0);
		expect(player.isPlaying).toBe(true);
		expect(player.colorHistory).toHaveLength(1);
	}
	await expect(settle()).resolves.toMatchObject({ isFinished: true });
});

test('manual cancellations drop the unplayed game from history but block the rejected pairing', async () => {
	const { game, players } = await playingTournament();
	await gameService.cancelGame(game._id);
	const [white, black] = await Promise.all(players.map((player) => Player.findById(player._id)));
	expect(white.recentOpponents).toHaveLength(0);
	expect(white.colorHistory).toEqual([]);
	expect(white.gamesPlayed).toBe(0);
	expect(String(white.lastCancelledOpponent)).toBe(String(black._id));
	expect(String(black.lastCancelledOpponent)).toBe(String(white._id));
});

test('the next game clears the cancelled-pairing block', async () => {
	const { tournament, game, players } = await playingTournament();
	await gameService.cancelGame(game._id);
	const third = await Player.create({ tournament: tournament._id, tempName: 'Third', entryRating: 1550 });
	await gameService.createGameFromPairing(players[0]._id, third._id, tournament._id);
	const white = await Player.findById(players[0]._id);
	expect(white.lastCancelledOpponent).toBeNull();
	expect(white.colorHistory).toEqual(['white']);
});

test.each(['pausePlayer', 'leaveTournament'])('%s continues cleanup when a concurrent result wins the cancellation', async (action) => {
	const { tournament, game, players } = await playingTournament();
	const cancel = gameService.cancelGame.bind(gameService);
	const spy = jest.spyOn(gameService, 'cancelGame').mockImplementationOnce(async (...args) => {
		await gameService.submitGameResult(game._id, 'draw');
		return cancel(...args);
	});
	try {
		await tournamentService[action](players[0]._id, tournament._id);
		const player = await Player.findById(players[0]._id);
		expect(player[action === 'pausePlayer' ? 'pausedAt' : 'withdrawnAt']).toBeInstanceOf(Date);
		expect(player.isPlaying).toBe(false);
		expect(player.score).toBe(0.5);
	} finally { spy.mockRestore(); }
});

test('a scheduled start that wins the deletion race preserves the tournament and players', async () => {
	const tournament = await Tournament.create({ name: 'Delete race', durationMs: 60000 });
	await Player.create({ tournament: tournament._id });
	const deletion = Tournament.findOneAndDelete.bind(Tournament);
	const spy = jest.spyOn(Tournament, 'findOneAndDelete').mockImplementationOnce(async (...args) => {
		await tournamentService.startTournament(tournament._id);
		return deletion(...args);
	});
	try {
		await expect(tournamentService.deleteTournament(tournament._id)).rejects.toMatchObject({ status: 409 });
		expect((await Tournament.findById(tournament._id)).tournStatus).toBe('in progress');
		expect(await Player.countDocuments({ tournament: tournament._id })).toBe(1);
	} finally { spy.mockRestore(); }
});

test('deletion removes every tournament log without writing an orphan deletion event', async () => {
	const tournament = await Tournament.create({ name: 'Delete', durationMs: 60000 });
	await require('../src/services/tournamentLogger').logEvent(tournament._id, 'tournament.created');
	await tournamentService.deleteTournament(tournament._id);
	expect(await require('../src/models/TournamentLog').countDocuments({ tournamentId: tournament._id })).toBe(0);
});

test.each(['result', 'cancel'])('%s remains successful when completion must be retried', async (operation) => {
	const { tournament, game } = await playingTournament();
	await tournamentService.endTournament(tournament._id);
	const count = jest.spyOn(Game, 'countDocuments').mockRejectedValueOnce(new Error('completion unavailable'));
	const error = jest.spyOn(console, 'error').mockImplementation(() => {});
	try {
		const result = operation === 'result' ? await gameService.submitGameResult(game._id, 'white') : await gameService.cancelGame(game._id);
		expect(result.isFinished).toBe(true);
		expect(require('../src/services/tournamentScheduler').retries.has(String(tournament._id))).toBe(true);
		await gameService.completeIfNoActiveGames(tournament._id);
		expect((await Tournament.findById(tournament._id)).tournStatus).toBe('completed');
	} finally { count.mockRestore(); error.mockRestore(); }
});

test('start succeeds after committing its transition even if pairing startup needs a retry', async () => {
	const tournament = await Tournament.create({ name: 'Retry pairing', durationMs: 60000 });
	const spy = require('../src/services/pairingService').startPairingLoop.mockRejectedValueOnce(new Error('Pairing unavailable'));
	const error = jest.spyOn(console, 'error').mockImplementation(() => {});
	try {
		expect(await tournamentService.startTournament(tournament._id)).toMatchObject({ tournStatus: 'in progress' });
		expect(require('../src/services/tournamentScheduler').retries.has(String(tournament._id))).toBe(true);
	} finally { spy.mockReset(); error.mockRestore(); }
});

test('cancellation returns both players to the waiting pool', async () => {
	const { game, players } = await playingTournament();
	await gameService.cancelGame(game._id);
	const waiting = await Player.find({ _id: { $in: players.map((player) => player._id) }, status: 'active', isPlaying: false });
	expect(waiting).toHaveLength(2);
	for (const player of waiting) expect(player.waitingSince).toBeInstanceOf(Date);
});
