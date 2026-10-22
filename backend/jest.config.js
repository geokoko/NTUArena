module.exports = {
	testEnvironment: 'node',
	testMatch: ['**/__tests__/**/*.test.js'],
	testTimeout: 30000,
	setupFiles: ['<rootDir>/jest.setup.js'],
	moduleNameMapper: {
		'^.*/pairingService$': '<rootDir>/__mocks__/pairingService.js',
	},
};
