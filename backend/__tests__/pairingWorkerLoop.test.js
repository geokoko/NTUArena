const Tournament = require('../src/models/Tournament');
const Player = require('../src/models/Player');
const gameService = require('../src/services/gameService');
const { logEvent } = require('../src/services/tournamentLogger');
const { evaluatePair } = require('../src/services/pairing/pairingScorer');
const { PairingWorker } = require('../src/services/pairing/pairingWorker');

jest.mock('../src/services/gameService', () => ({ createGameFromPairing: jest.fn() }));
jest.mock('../src/services/tournamentLogger', () => ({ logEvent: jest.fn() }));
jest.mock('../src/services/pairing/pairingDebugLogger', () => ({ debugPairing: jest.fn() }));
jest.mock('../src/services/pairing/pairingScorer', () => ({ evaluatePair: jest.fn() }));

let tournament;
let worker;
let running;
let pools;
const pool = (count, age = 31000) => Array.from({ length: count }, (_, i) => ({
	_id: `player-${i}`, status: 'active', waitingSince: new Date(Date.now() - age), score: 0, entryRating: 1500,
}));
// Each cycle reads the next pool; the last one repeats. Functions build the
// pool at read time so waitingSince follows the fake clock.
const waitingPools = (...next) => { pools = next; };

beforeEach(() => {
	jest.useFakeTimers();
	tournament = { tournStatus: 'in progress', settleMs: null };
	pools = [[]];
	jest.spyOn(Tournament, 'findById').mockImplementation(() => ({ select: async () => ({ ...tournament }) }));
	jest.spyOn(Player, 'find').mockImplementation(() => {
		const current = pools.length > 1 ? pools.shift() : pools[0];
		const players = typeof current === 'function' ? current() : current;
		return { select: () => ({ sort: () => ({ limit: () => ({ lean: async () => players }) }) }) };
	});
	evaluatePair.mockImplementation((white, black) => ({ ok: true, score: 1, colors: { white, black } }));
	gameService.createGameFromPairing.mockResolvedValue({ _id: 'game' });
	worker = new PairingWorker({ settleMs: 30000, idleMs: 400 });
});

afterEach(async () => {
	worker.stop();
	await jest.advanceTimersByTimeAsync(60000);
	if (running) await running;
	running = null;
	jest.useRealTimers();
	jest.restoreAllMocks();
	jest.clearAllMocks();
});

test('reads the waiting pool of active, idle players from MongoDB', async () => {
	waitingPools(() => pool(2), []);
	running = worker.start('tournament');
	await jest.advanceTimersByTimeAsync(0);
	expect(Player.find).toHaveBeenCalledWith({ tournament: 'tournament', status: 'active', isPlaying: false });
	expect(gameService.createGameFromPairing).toHaveBeenCalledWith('player-0', 'player-1', 'tournament');
});

test.each([1, 2])('unchanged waiting pool of %i players produces no persistent summaries', async (count) => {
	evaluatePair.mockReturnValue({ ok: false });
	waitingPools(() => pool(count));
	running = worker.start('tournament');
	await jest.advanceTimersByTimeAsync(1600);
	expect(Player.find.mock.calls.length).toBeGreaterThanOrEqual(4);
	expect(logEvent).not.toHaveBeenCalled();
	expect(gameService.createGameFromPairing).not.toHaveBeenCalled();
});

test('productive batches report successful games and retain leftover information', async () => {
	waitingPools(() => pool(3), []);
	running = worker.start('tournament');
	await jest.advanceTimersByTimeAsync(1000);
	expect(logEvent).toHaveBeenCalledTimes(1);
	expect(logEvent).toHaveBeenCalledWith('tournament', 'pairing.summary', expect.objectContaining({
		message: 'Pairing batch produced 1 game(s).',
		payload: expect.objectContaining({ pairsProduced: 1, leftovers: [expect.any(String)], byes: [expect.objectContaining({ reason: 'odd-player-pool' })] }),
	}));
});

test('failed game creation leaves both players in the pool for the next cycle', async () => {
	waitingPools(() => pool(2));
	gameService.createGameFromPairing.mockRejectedValueOnce(new Error('transaction failed'));
	running = worker.start('tournament');
	await jest.advanceTimersByTimeAsync(0);
	expect(gameService.createGameFromPairing).toHaveBeenCalledTimes(1);
	expect(logEvent).not.toHaveBeenCalled();
	await jest.advanceTimersByTimeAsync(400);
	expect(gameService.createGameFromPairing).toHaveBeenCalledTimes(2);
	expect(logEvent).toHaveBeenCalledTimes(1);
});

test('a newly waiting player holds the quiet window open', async () => {
	const arrivedAt = Date.now();
	waitingPools(() => [...pool(1), { _id: 'new', status: 'active', waitingSince: new Date(arrivedAt) }]);
	running = worker.start('tournament');
	await jest.advanceTimersByTimeAsync(29000);
	expect(gameService.createGameFromPairing).not.toHaveBeenCalled();
	await jest.advanceTimersByTimeAsync(1500);
	expect(gameService.createGameFromPairing).toHaveBeenCalled();
});

test('players already waiting when the worker starts pair without a quiet window', async () => {
	worker = new PairingWorker({ settleMs: 30000, idleMs: 400, settledBefore: Date.now() });
	waitingPools(pool(2, 0), []);
	running = worker.start('tournament');
	await jest.advanceTimersByTimeAsync(0);
	expect(gameService.createGameFromPairing).toHaveBeenCalledTimes(1);
});

test('clearing a 60-second override uses the 30-second fallback on the next cycle', async () => {
	tournament.settleMs = 60000;
	waitingPools([], () => pool(2), []);
	running = worker.start('tournament');
	await jest.advanceTimersByTimeAsync(0);
	tournament.settleMs = null;
	await jest.advanceTimersByTimeAsync(401);
	expect(gameService.createGameFromPairing).toHaveBeenCalledTimes(1);
	expect(logEvent.mock.calls[0][2].payload.settleMs).toBe(30000);
});

test('clearing a disabled override restores the default quiet window', async () => {
	tournament.settleMs = 0;
	waitingPools([], () => pool(2, 0));
	running = worker.start('tournament');
	await jest.advanceTimersByTimeAsync(0);
	tournament.settleMs = null;
	await jest.advanceTimersByTimeAsync(401);
	expect(gameService.createGameFromPairing).not.toHaveBeenCalled();
});
