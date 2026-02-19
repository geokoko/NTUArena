module.exports = {
	testEnvironment: 'node',
	testMatch: ['**/__tests__/**/*.test.js'],
	testTimeout: 30000,
	moduleNameMapper: {
		'^.*/queue/redisQueue$': '<rootDir>/__mocks__/redisQueue.js',
		'^.*/pairingService$': '<rootDir>/__mocks__/pairingService.js',
	},
};
