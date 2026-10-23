const Tournament = require('../src/models/Tournament');
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
	jest.spyOn(Tournament, 'findById').mockResolvedValue({ tournStatus: 'in progress', settleMs: 45000 });
	jest.spyOn(pairingService, 'markWaitingPlayers').mockResolvedValue();
});
afterEach(() => {
	pairingService.stopPairingLoop('tournament');
	jest.restoreAllMocks();
	jest.clearAllMocks();
});

test('concurrent recovery and start only mark waiting players and start one worker', async () => {
	await Promise.all([pairingService.startPairingLoop('tournament'), pairingService.startPairingLoop('tournament')]);
	expect(pairingService.markWaitingPlayers).toHaveBeenCalledTimes(1);
	expect(PairingWorker).toHaveBeenCalledTimes(1);
	expect(PairingWorker).toHaveBeenCalledWith(expect.objectContaining({ settleMs: 30000 }));
});

test.each([60000, 0])('startup with override %i settles the existing pool and keeps the environment fallback', async (settleMs) => {
	Tournament.findById.mockResolvedValue({ tournStatus: 'in progress', settleMs });
	const before = Date.now();
	await pairingService.startPairingLoop('tournament');
	expect(pairingService.markWaitingPlayers).toHaveBeenCalledWith('tournament', expect.any(Date));
	const [, startedAt] = pairingService.markWaitingPlayers.mock.calls[0];
	expect(startedAt.getTime()).toBeGreaterThanOrEqual(before);
	expect(PairingWorker).toHaveBeenCalledWith(expect.objectContaining({ settleMs: 30000, settledBefore: startedAt.getTime() }));
});

test('stopping while marking waiting players prevents a late worker from starting', async () => {
	let release;
	pairingService.markWaitingPlayers.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
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
	expect(pairingService.markWaitingPlayers).not.toHaveBeenCalled();
	expect(PairingWorker).not.toHaveBeenCalled();
});

test('recovery preserves wait priority by only stamping players without waitingSince', async () => {
	pairingService.markWaitingPlayers.mockRestore();
	const Player = require('../src/models/Player');
	const now = new Date();
	jest.spyOn(Player, 'updateMany').mockResolvedValue({ modifiedCount: 1 });
	jest.spyOn(console, 'log').mockImplementation(() => {});
	await pairingService.markWaitingPlayers('tournament', now);
	expect(Player.updateMany).toHaveBeenCalledWith(
		{ tournament: 'tournament', isPlaying: false, status: 'active', waitingSince: null },
		{ $set: { waitingSince: now } },
	);
});
