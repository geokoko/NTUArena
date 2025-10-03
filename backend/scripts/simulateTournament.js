// scripts/simulateTournamentPipeline.js
require('dotenv').config();

const mongoose = require('mongoose');

// Models
const Tournament = require('../src/models/Tournament');
const Player     = require('../src/models/Player');
const Game       = require('../src/models/Game');
const User       = require('../src/models/User');

// Services 
const tournamentService = require('../src/services/tournamentService');
const gameService       = require('../src/services/gameService');

// Helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];

function randomName() {
	const tags = ['Arena', 'Blitz', 'Rapid', 'Classic', 'Open', 'Cup', 'Challenge'];
	const cities = ['Athens', 'Patras', 'Volos', 'Heraklion', 'Larissa', 'Ioannina'];
	return `${randChoice(cities)} ${randChoice(tags)} ${new Date().toISOString().slice(0,10)}`;
}

async function connectMongo() {
	const uri = process.env.MONGO_URI || 'mongodb://mongo:27017/ntuarena?replicaSet=rs0';
	console.log("[SIM] Connecting to MongoDB at URI:", uri);
	await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
}

async function pickUsers(count) {
	// grab more than needed and sample
	const users = await User.aggregate([{ $sample: { size: Math.max(count * 2, count + 5) } }]);
	console.log(`[SIM] Picked ${users.length} users from database.`);
	// shuffle and return only 'count' users
	users.sort(() => Math.random() - 0.5);
	return users.slice(0, count);
}

/**
 * Inserts simulated users into the database.
 * Creates unique username/email pairs using a timestamp-based prefix
 * to avoid violating unique constraints.
 *
 * @param {number} count - Number of users to insert
 * @returns {Promise<Array>} Inserted user documents
 */
async function addUsersToDatabase(count) {
	const prefix = `sim_${Date.now()}`;
	const docs = Array.from({ length: count }, (_, i) => {
		const rating = Math.max(800, Math.round(1200 + (Math.random() - 0.5) * 600));
		return {
			username: `${prefix}_${i}`,
			email: `${prefix}_${i}@example.com`,
			role: 'player',
			globalElo: rating,
			isActive: true,
			profile: {
				firstName: 'Sim',
				lastName: `User${i}`,
				country: 'GR',
				city: 'Athens',
			},
			statistics: {
				totalGames: 0,
				totalWins: 0,
				totalLosses: 0,
				totalDraws: 0,
				tournamentParticipations: 0,
				tournamentWins: 0,
			},
		};
	});

	try {
		const inserted = await User.insertMany(docs, { ordered: false });
		console.log(`[SIM] Inserted ${inserted.length} new simulated user(s).`);
		return inserted;
	} catch (err) {
		console.error('[SIM] Error inserting simulated users:', err.message);
		throw err;
	}
}

async function registerPlayers(tournamentId, users) {
	const now = new Date();
	const docs = users.map((u) => ({
		user: u._id,
		tournament: tournamentId,
		score: 0,
		liveRating: Number.isFinite(u.liveRating) ? u.liveRating : Math.max(800, Math.round(1200 + (Math.random() - 0.5) * 600)),
		isPlaying: false,
		waitingSince: now,
		gameHistory: [],
		colorHistory: [],
		recentOpponents: [],
	}));
	await Player.insertMany(docs, { ordered: false });
	console.log(`[SIM] Registered ${docs.length} players into tournament ${tournamentId}.`);
	console.log('[SIM] Sample players:', docs.slice(0, 3));
}

async function summarize(tournamentId) {
	const [players, games, ongoing, finished] = await Promise.all([
		Player.countDocuments({ tournament: tournamentId }),
		Game.countDocuments({ tournament: tournamentId }),
		Game.countDocuments({ tournament: tournamentId, isFinished: false }),
		Game.countDocuments({ tournament: tournamentId, isFinished: true }),
	]);

	console.log(`[SIM] Tournament ${tournamentId} summary:`);
	console.log(`       Players: ${players}`);
	console.log(`          Games: ${games}`);
	console.log(`      Ongoing: ${ongoing}`);
	console.log(`      Finished: ${finished}`);
	return { players, games, ongoing, finished };
}

async function simulate() {
	await connectMongo();

	// 1) Admin creates tournament
	const now = new Date();
	const start = new Date(now.getTime() + 60 * 1000); // 1 min from now
	const end = new Date(start.getTime() + 30 * 60 * 1000); // 30 min after start
	const t = new Tournament({
		name: process.env.SIM_TOURNAMENT_NAME || randomName(),
		timeControl: process.env.SIM_TIME_CONTROL || '5+0',
		startDate: start,
		endDate: end,
		tournStatus: 'upcoming',
		participants: [],
	});
	await t.save();

	const TID = String(t._id);
	console.log('[SIM] Created tournament:', TID, '-', t.name);


	// 2) Ensure enough users exist; seed if needed, then register
	const PLAYER_COUNT = parseInt(process.env.SIM_PLAYERS || '24', 10);
	const existingUsers = await User.countDocuments();
	if (existingUsers < PLAYER_COUNT) {
		const toAdd = PLAYER_COUNT - existingUsers;
		console.log(`[SIM] Not enough users (${existingUsers}) for ${PLAYER_COUNT} players. Seeding ${toAdd} user(s)...`);
		await addUsersToDatabase(toAdd);
	}

	const users = await pickUsers(PLAYER_COUNT);
	if (users.length < 2) throw new Error('Not enough users to register as players.');

	await registerPlayers(TID, users);
	console.log(`[SIM] Registered ${users.length} players.`);

	// 3) Admin starts tournament (this seeds Redis queue & starts pairing worker via tournamentService)
	await tournamentService.startTournament(TID);
	console.log('[SIM] Tournament started. Pairing worker running...');

	// 4) Pairing happens; we periodically finish random ongoing games
	const cycles = parseInt(process.env.SIM_CYCLES || '25', 10);
	const perCycleToFinish = parseInt(process.env.SIM_FINISH_PER_CYCLE || '6', 10);

	for (let c = 1; c <= cycles; c++) {
		// Give the worker a bit of time to create games
		await sleep(parseInt(process.env.SIM_CYCLE_DELAY_MS || '800', 10));

		// Fetch some ongoing games
		const ongoing = await Game.find({ tournament: TID, isFinished: false })
			.select('_id')
			.limit(perCycleToFinish)
			.lean();

		if (ongoing.length) {
			console.log(`[SIM] Cycle ${c}: finishing ${ongoing.length} game(s)...`);
		} else {
			console.log(`[SIM] Cycle ${c}: no ongoing games found (yet).`);
		}

		// Finish them with random results
		for (const g of ongoing) {
			const result = randChoice(['1-0', '0-1', '1/2-1/2']);
			try {
				await gameService.submitGameResult(g._id, result);
			} catch (e) {
				// If a race happens (e.g., worker already finished/modified), ignore and continue
				console.warn('[SIM] submitGameResult warning:', e.message);
			}
		}
	}

	// 5) End tournament
	await tournamentService.endTournament(TID);
	console.log('[SIM] Tournament ended.');

	// 6) Summary
	const s = await summarize(TID);
	console.log('[SIM] Summary:', s);

	await mongoose.disconnect();
}

simulate().catch(async (err) => {
	console.error(err);
	try { await mongoose.disconnect(); } catch {}
	process.exit(1);
});
