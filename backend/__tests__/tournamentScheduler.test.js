const Tournament = require('../src/models/Tournament');
const pairingService = require('../src/services/pairingService');
const tournamentService = require('../src/services/tournamentService');
const gameService = require('../src/services/gameService');
const { TournamentScheduler } = require('../src/services/tournamentScheduler');

jest.mock('../src/services/tournamentService', () => ({ startTournamentAuto: jest.fn(), endTournament: jest.fn() }));
jest.mock('../src/services/gameService', () => ({ completeIfNoActiveGames: jest.fn() }));

let scheduler;
const now = new Date('2026-10-19T10:00:00Z');
const tournament = (status, fields = {}) => ({ _id: 'tournament', tournStatus: status, ...fields });
beforeEach(() => {
	jest.useFakeTimers({ now });
	scheduler = new TournamentScheduler();
	jest.spyOn(Tournament, 'findById');
});
afterEach(() => {
	scheduler.clearAll();
	jest.restoreAllMocks();
	jest.clearAllMocks();
	jest.useRealTimers();
});

test('schedules beyond the Node timeout limit do not start early', async () => {
	const scheduledStartDate = new Date(+now + 35 * 86400000);
	Tournament.findById.mockResolvedValue(tournament('upcoming', { scheduledStartDate }));
	scheduler.scheduleTournament(tournament('upcoming', { scheduledStartDate }));
	await jest.advanceTimersByTimeAsync(2 ** 31 - 1);
	expect(tournamentService.startTournamentAuto).not.toHaveBeenCalled();
	await jest.advanceTimersByTimeAsync(scheduledStartDate - Date.now());
	expect(tournamentService.startTournamentAuto).toHaveBeenCalledTimes(1);
});

test('replacing and clearing schedules cancels their callbacks', async () => {
	scheduler.scheduleTournament(tournament('upcoming', { scheduledStartDate: new Date(+now + 1000) }));
	scheduler.scheduleTournament(tournament('upcoming', { scheduledStartDate: new Date(+now + 5000) }));
	await jest.advanceTimersByTimeAsync(1000);
	expect(Tournament.findById).not.toHaveBeenCalled();
	scheduler.clearTournament('tournament');
	await jest.advanceTimersByTimeAsync(5000);
	expect(Tournament.findById).not.toHaveBeenCalled();
});

test('restart resumes pairing and rearms the automatic end', async () => {
	const active = tournament('in progress', { endDate: new Date(+now + 1000) });
	jest.spyOn(Tournament, 'find').mockResolvedValue([active]);
	Tournament.findById.mockResolvedValue(active);
	await scheduler.scheduleAll();
	expect(pairingService.startPairingLoop).toHaveBeenCalledWith('tournament');
	await jest.advanceTimersByTimeAsync(1000);
	expect(tournamentService.endTournament).toHaveBeenCalledWith('tournament', { trigger: 'auto' });
});

test('restart ends expired tournaments without resuming pairing', async () => {
	Tournament.findById.mockResolvedValue(tournament('in progress', { endDate: new Date(+now - 1) }));
	await scheduler.recoverTournament('tournament');
	expect(tournamentService.endTournament).toHaveBeenCalled();
	expect(pairingService.startPairingLoop).not.toHaveBeenCalled();
});

test('restart reconciles finishing tournaments', async () => {
	Tournament.findById.mockResolvedValue(tournament('finishing'));
	await scheduler.recoverTournament('tournament');
	expect(gameService.completeIfNoActiveGames).toHaveBeenCalledWith('tournament');
});

test('transient timer failures are retried', async () => {
	jest.spyOn(console, 'error').mockImplementation(() => {});
	Tournament.findById.mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValue(tournament('finishing'));
	scheduler.scheduleTournament(tournament('upcoming', { scheduledStartDate: new Date(+now + 1000) }));
	await jest.advanceTimersByTimeAsync(6000);
	expect(gameService.completeIfNoActiveGames).toHaveBeenCalledTimes(1);
});
