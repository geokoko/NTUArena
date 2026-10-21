const Tournament = require('../src/models/Tournament');
const Player = require('../src/models/Player');
const queue = require('../src/services/queue/redisQueue');
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
const pool = (count, age = 31000) => Array.from({ length: count }, (_, i) => ({
	_id: `player-${i}`, enqueuedAt: Date.now() - age, score: 0, entryRating: 1500,
}));

beforeEach(() => {
	jest.useFakeTimers();
	tournament = { tournStatus: 'in progress', settleMs: null };
	jest.spyOn(Tournament, 'findById').mockImplementation(() => ({ select: async () => ({ ...tournament }) }));
	jest.spyOn(Player, 'find').mockImplementation(({ _id }) => ({
		select: () => ({ lean: async () => _id.$in.map((id) => ({ _id: id, status: 'active', isPlaying: false })) }),
	}));
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

test.each([1, 2])('unchanged waiting pool of %i players produces no persistent summaries', async (count) => {
	evaluatePair.mockReturnValue({ ok: false });
	queue.batchDequeueToPending.mockResolvedValue(pool(count));
	running = worker.start('tournament');
	await jest.advanceTimersByTimeAsync(1600);
	expect(queue.batchDequeueToPending.mock.calls.length).toBeGreaterThanOrEqual(4);
	expect(logEvent).not.toHaveBeenCalled();
	expect(gameService.createGameFromPairing).not.toHaveBeenCalled();
});

test('productive batches report successful games and retain leftover information', async () => {
	queue.batchDequeueToPending.mockResolvedValueOnce(pool(3)).mockResolvedValue([]);
	running = worker.start('tournament');
	await jest.advanceTimersByTimeAsync(1000);
	expect(logEvent).toHaveBeenCalledTimes(1);
	expect(logEvent).toHaveBeenCalledWith('tournament', 'pairing.summary', expect.objectContaining({
		message: 'Pairing batch produced 1 game(s).',
		payload: expect.objectContaining({ pairsProduced: 1, leftovers: [expect.any(String)], byes: [expect.objectContaining({ reason: 'odd-player-pool' })] }),
	}));
});

test('failed game creation is requeued without reporting a produced game', async () => {
	queue.batchDequeueToPending.mockResolvedValueOnce(pool(2)).mockResolvedValue([]);
	gameService.createGameFromPairing.mockRejectedValue(new Error('transaction failed'));
	running = worker.start('tournament');
	await jest.advanceTimersByTimeAsync(1000);
	expect(queue.requeueLeftovers).toHaveBeenCalledWith('tournament', worker.workerId, expect.arrayContaining([
		expect.objectContaining({ _id: 'player-0' }), expect.objectContaining({ _id: 'player-1' }),
	]));
	expect(logEvent).not.toHaveBeenCalled();
});

test('clearing a 60-second override uses the 30-second fallback on the next cycle', async () => {
	tournament.settleMs = 60000;
	queue.batchDequeueToPending.mockResolvedValueOnce([]).mockResolvedValueOnce(pool(2)).mockResolvedValue([]);
	running = worker.start('tournament');
	await jest.advanceTimersByTimeAsync(0);
	tournament.settleMs = null;
	await jest.advanceTimersByTimeAsync(401);
	expect(gameService.createGameFromPairing).toHaveBeenCalledTimes(1);
	expect(logEvent.mock.calls[0][2].payload.settleMs).toBe(30000);
});

test('clearing a disabled override restores the default quiet window', async () => {
	tournament.settleMs = 0;
	queue.batchDequeueToPending.mockResolvedValueOnce([]).mockResolvedValueOnce(pool(2, 0)).mockResolvedValue([]);
	running = worker.start('tournament');
	await jest.advanceTimersByTimeAsync(0);
	tournament.settleMs = null;
	await jest.advanceTimersByTimeAsync(401);
	expect(gameService.createGameFromPairing).not.toHaveBeenCalled();
	expect(queue.requeueLeftovers).toHaveBeenCalledWith('tournament', worker.workerId, expect.arrayContaining([expect.objectContaining({ _id: 'player-0' })]));
});
