const mongoose = require('mongoose');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function connectDB() {
	const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://mongodb:27017/ntuarena';
	const dbName = process.env.MONGO_DB || process.env.MONGODB_DB || undefined; // optional
	const maxAttempts = parseInt(process.env.MONGO_MAX_RETRIES || '30', 10);
	const baseDelay = parseInt(process.env.MONGO_RETRY_DELAY || '1000', 10);

	mongoose.set('strictQuery', true);

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			console.log(`[DB] Connecting to ${uri}${dbName ? ` (db=${dbName})` : ''} attempt ${attempt}/${maxAttempts}`);
			await mongoose.connect(uri, dbName ? { dbName } : undefined);
			console.log('[DB] Connected');
			return;
		} catch (err) {
			const delay = Math.min(baseDelay * attempt, 10000);
			console.error(`[DB] Connection failed (attempt ${attempt}):`, err.message);
			if (attempt === maxAttempts) throw err;
			console.log(`[DB] Retrying in ${delay}ms...`);
			await sleep(delay);
		}
	}
}

module.exports = connectDB;
