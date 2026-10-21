const Tournament = require('../src/models/Tournament');
const { redis } = require('../src/services/queue/redisQueue');
const { PairingWorker } = require('../src/services/pairing/pairingWorker');
// Include .js to load the real service instead of the integration-test mapper.
const pairingService = require('../src/services/pairingService.js');

jest.mock('../src/services/pairing/pairingWorker', () => ({
	PairingWorker: jest.fn().mockImplementation(() => ({
		start: jest.fn(() => new Promise(() => {})), stop: jest.fn(),
	})),
}));

beforeEach(() => {
	jest.replaceProperty(process, 'env', { ...process.env, PAIRING_SETTLE_MS: '30000' });
	redis.status = 'ready';
	jest.spyOn(Tournament, 'findById').mockResolvedValue({ tournStatus: 'in progress', settleMs: 45000 });
	jest.spyOn(pairingService, 'seedQueueOnStart').mockResolvedValue();
});
afterEach(() => {
	pairingService.stopPairingLoop('tournament');
	jest.restoreAllMocks();
	jest.clearAllMocks();
});

test('concurrent recovery and start only seed and start one worker', async () => {
	await Promise.all([pairingService.startPairingLoop('tournament'), pairingService.startPairingLoop('tournament')]);
	expect(pairingService.seedQueueOnStart).toHaveBeenCalledTimes(1);
	expect(PairingWorker).toHaveBeenCalledTimes(1);
	expect(PairingWorker).toHaveBeenCalledWith(expect.objectContaining({ settleMs: 30000 }));
});

test.each([60000, 0])('startup override %i does not replace the environment fallback', async (settleMs) => {
	Tournament.findById.mockResolvedValue({ tournStatus: 'in progress', settleMs });
	const now = Date.now();
	jest.spyOn(Date, 'now').mockReturnValue(now);
	await pairingService.startPairingLoop('tournament');
	expect(pairingService.seedQueueOnStart).toHaveBeenCalledWith('tournament', { enqueuedAt: now - settleMs });
	expect(PairingWorker).toHaveBeenCalledWith(expect.objectContaining({ settleMs: 30000 }));
});

test('stopping during seeding prevents a late worker from starting', async () => {
	let release;
	pairingService.seedQueueOnStart.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
	const starting = pairingService.startPairingLoop('tournament');
	await Promise.resolve();
	pairingService.stopPairingLoop('tournament');
	release();
	await starting;
	expect(PairingWorker).not.toHaveBeenCalled();
	expect(pairingService.workers.size).toBe(0);
});

test('closed tournaments cannot resume pairing on recovery', async () => {
	Tournament.findById.mockResolvedValue({ tournStatus: 'finishing' });
	await pairingService.startPairingLoop('tournament');
	expect(pairingService.seedQueueOnStart).not.toHaveBeenCalled();
	expect(PairingWorker).not.toHaveBeenCalled();
});

test('queue recovery preserves wait priority and removes old snapshots in one batch', async () => {
	pairingService.seedQueueOnStart.mockRestore();
	const Player = require('../src/models/Player');
	const queue = require('../src/services/queue/redisQueue');
	const waitingSince = new Date(Date.now() - 60000);
	jest.spyOn(Player, 'updateMany').mockResolvedValue({ modifiedCount: 0 });
	jest.spyOn(Player, 'find').mockReturnValue({ select: async () => [
		{ _id: 'alice', tempName: 'Guest Alice', status: 'active', waitingSince },
		{ _id: 'bob', status: 'active', waitingSince },
	] });
	await pairingService.seedQueueOnStart('tournament', { enqueuedAt: 123 });
	expect(Player.updateMany).toHaveBeenCalledWith(expect.objectContaining({ waitingSince: null }), expect.any(Object));
	expect(queue.removePlayersEverywhere).toHaveBeenCalledTimes(1);
	expect(queue.removePlayersEverywhere).toHaveBeenCalledWith('tournament', ['alice', 'bob']);
	expect(queue.enqueueMany).toHaveBeenCalledWith('tournament', [
		expect.objectContaining({ _id: 'alice', tempName: 'Guest Alice', waitingSince, enqueuedAt: 123 }),
		expect.objectContaining({ _id: 'bob', waitingSince, enqueuedAt: 123 }),
	]);
});
