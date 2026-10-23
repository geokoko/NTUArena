const mongoose = require('mongoose');
const Tournament = require('../src/models/Tournament');
const Game = require('../src/models/Game');
const tournamentService = require('../src/services/tournamentService');
const gameService = require('../src/services/gameService');
const pairingService = require('../src/services/pairingService');
const scheduler = require('../src/services/tournamentScheduler');

jest.mock('../src/services/tournamentLogger', () => ({ logEvent: jest.fn().mockResolvedValue() }));

const now = new Date('2026-10-19T10:00:00Z');
const makeTournament = (fields = {}) => ({
	_id: new mongoose.Types.ObjectId(), publicId: 'tournament', name: 'Arena',
	tournStatus: 'upcoming', durationMs: 60000, scheduledStartDate: null, participants: [], ...fields,
});
beforeEach(() => {
	jest.useFakeTimers({ now });
	jest.spyOn(scheduler, 'scheduleTournament').mockResolvedValue();
});
afterEach(() => {
	scheduler.clearAll();
	jest.restoreAllMocks();
	jest.clearAllMocks();
	jest.useRealTimers();
});

test('manual start records actual start and derives end from duration', async () => {
	const existing = makeTournament();
	jest.spyOn(Tournament, 'findOne').mockResolvedValue(existing);
	jest.spyOn(Tournament, 'findOneAndUpdate').mockImplementation(async (_, update) => ({ ...existing, ...update.$set }));
	const started = await tournamentService.startTournament('tournament');
	expect(started.actualStartDate).toEqual(now);
	expect(started.endDate).toEqual(new Date(+now + 60000));
	expect(pairingService.startPairingLoop).toHaveBeenCalledTimes(1);
});

test('old auto-start callbacks cannot start rescheduled tournaments early', async () => {
	jest.spyOn(Tournament, 'findOne').mockResolvedValue(makeTournament({ scheduledStartDate: new Date(+now + 1000) }));
	jest.spyOn(Tournament, 'findOneAndUpdate');
	expect(await tournamentService.startTournament('tournament', { trigger: 'auto' })).toBeNull();
	expect(Tournament.findOneAndUpdate).not.toHaveBeenCalled();
});

test('only the winner of an atomic start transition starts pairing', async () => {
	const existing = makeTournament();
	jest.spyOn(Tournament, 'findOne').mockResolvedValue(existing);
	jest.spyOn(Tournament, 'findOneAndUpdate').mockResolvedValueOnce({ ...existing, tournStatus: 'in progress', endDate: new Date(+now + 60000) }).mockResolvedValueOnce(null);
	const results = await Promise.allSettled([tournamentService.startTournament('tournament'), tournamentService.startTournament('tournament')]);
	expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
	expect(pairingService.startPairingLoop).toHaveBeenCalledTimes(1);
});

test('elapsed automatic windows close without starting pairing', async () => {
	const existing = makeTournament({ scheduledStartDate: new Date(+now - 120000) });
	jest.spyOn(Tournament, 'findOne').mockResolvedValue(existing);
	jest.spyOn(Tournament, 'findOneAndUpdate').mockImplementation(async (_, update) => ({ ...existing, ...update.$set }));
	jest.spyOn(tournamentService, 'endTournament').mockResolvedValue({ tournStatus: 'completed' });
	expect(await tournamentService.startTournament('tournament', { trigger: 'auto' })).toEqual({ tournStatus: 'completed' });
	expect(pairingService.startPairingLoop).not.toHaveBeenCalled();
});

test('ending closes pairing before checking for drained games', async () => {
	const existing = makeTournament({ tournStatus: 'in progress' });
	jest.spyOn(Tournament, 'findOne').mockResolvedValue(existing);
	jest.spyOn(Tournament, 'findOneAndUpdate').mockResolvedValue({ ...existing, tournStatus: 'finishing' });
	jest.spyOn(gameService, 'completeIfNoActiveGames').mockImplementation(async () => {
		expect(Tournament.findOneAndUpdate).toHaveBeenCalled();
		expect(pairingService.stopPairingLoop).toHaveBeenCalled();
		return { ...existing, tournStatus: 'completed' };
	});
	expect((await tournamentService.endTournament('tournament')).tournStatus).toBe('completed');
});

test('finishing is preserved while a game remains active', async () => {
	const finishing = makeTournament({ tournStatus: 'finishing' });
	jest.spyOn(Tournament, 'findById').mockResolvedValue(finishing);
	jest.spyOn(Game, 'countDocuments').mockResolvedValue(1);
	jest.spyOn(Tournament, 'findOneAndUpdate');
	expect(await gameService.completeIfNoActiveGames(finishing._id)).toBe(finishing);
	expect(Tournament.findOneAndUpdate).not.toHaveBeenCalled();
});

test('an in-flight pairing cannot create a game after closure', async () => {
	const session = { withTransaction: async (fn) => fn(), endSession: jest.fn() };
	jest.spyOn(mongoose, 'startSession').mockResolvedValue(session);
	jest.spyOn(Tournament, 'findOneAndUpdate').mockResolvedValue(null);
	jest.spyOn(console, 'error').mockImplementation(() => {});
	await expect(gameService.createGameFromPairing('white', 'black', 'tournament')).rejects.toThrow('pairing is closed');
	expect(session.endSession).toHaveBeenCalled();
});

test('a player cannot be paired with themself', async () => {
	jest.spyOn(mongoose, 'startSession');
	await expect(gameService.createGameFromPairing('player', 'player', 'tournament')).rejects.toThrow('distinct players');
	expect(mongoose.startSession).not.toHaveBeenCalled();
});

test.each(['finishing', 'completed'])('CSV registration rejects %s tournaments', async (tournStatus) => {
	jest.spyOn(Tournament, 'findOne').mockResolvedValue(makeTournament({ tournStatus }));
	await expect(tournamentService.bulkAddPlayersFromCSV('tournament', [{ name: 'Player', rating: '1400' }])).rejects.toThrow('completed or finishing');
});
