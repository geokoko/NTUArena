// Mock the pairing service to prevent actual pairing loops during tests
const startPairingLoop = jest.fn();
const stopPairingLoop = jest.fn();

module.exports = {
	startPairingLoop,
	stopPairingLoop,
};
