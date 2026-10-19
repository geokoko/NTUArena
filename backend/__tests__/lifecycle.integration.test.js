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
