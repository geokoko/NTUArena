// Set required env variables before importing any app modules
process.env.JWT_SECRET = 'test-secret-for-unit-tests';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

/**
 * Connect to an in-memory MongoDB instance for testing.
 */
async function connect() {
	mongoServer = await MongoMemoryServer.create();
	const uri = mongoServer.getUri();
	await mongoose.connect(uri);
}

/**
 * Drop all collections after each test.
 */
async function clearDatabase() {
	const collections = mongoose.connection.collections;
	for (const key in collections) {
		await collections[key].deleteMany({});
	}
}

/**
 * Disconnect and stop the in-memory server.
 */
async function disconnect() {
	await mongoose.connection.dropDatabase();
	await mongoose.disconnect();
	if (mongoServer) {
		await mongoServer.stop();
	}
}

module.exports = { connect, clearDatabase, disconnect };
