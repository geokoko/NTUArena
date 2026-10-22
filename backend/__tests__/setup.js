// Set required env variables before importing any app modules
process.env.JWT_SECRET = 'test-secret-for-unit-tests';
process.env.CORS_ORIGIN = '*';
process.env.NODE_ENV = 'test';

const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

let mongoServer;

/**
 * Connect to an in-memory MongoDB instance for testing.
 */
async function connect() {
	mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
	const uri = mongoServer.getUri();
	await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
}

/**
 * Drop all collections after each test.
 */
async function clearDatabase() {
	require('../src/services/tournamentScheduler').clearAll();
	if (mongoose.connection.readyState !== 1) return;
	const collections = mongoose.connection.collections;
	for (const key in collections) {
		await collections[key].deleteMany({});
	}
}

/**
 * Disconnect and stop the in-memory server.
 */
async function disconnect() {
	require('../src/services/tournamentScheduler').clearAll();
	try {
		if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
	} finally {
		await mongoose.disconnect();
		if (mongoServer) await mongoServer.stop();
	}
}

module.exports = { connect, clearDatabase, disconnect };
