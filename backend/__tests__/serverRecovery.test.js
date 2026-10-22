jest.mock('../src/app', () => ({ listen: jest.fn() }));
jest.mock('../src/config/database', () => jest.fn());
jest.mock('../src/services/tournamentScheduler', () => ({ scheduleAll: jest.fn(), retryAll: jest.fn() }));

const app = require('../src/app');
const connectDB = require('../src/config/database');
const scheduler = require('../src/services/tournamentScheduler');

afterEach(() => jest.restoreAllMocks());

test('listens before starting potentially slow tournament recovery', async () => {
	jest.spyOn(console, 'log').mockImplementation(() => {});
	connectDB.mockResolvedValue();
	scheduler.scheduleAll.mockReturnValue(new Promise(() => {}));
	app.listen.mockImplementation((port, ready) => {
		expect(scheduler.scheduleAll).not.toHaveBeenCalled();
		ready();
	});
	require('../src/server');
	await Promise.resolve();
	expect(app.listen).toHaveBeenCalled();
	expect(scheduler.scheduleAll).toHaveBeenCalled();
});
