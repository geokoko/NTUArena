// scripts/simulateTournamentPipeline.js
require('dotenv').config();

const mongoose = require('mongoose');

// Models
const Tournament = require('../src/models/Tournament');
const Player     = require('../src/models/Player');
const Game       = require('../src/models/Game');
const User       = require('../src/models/User');

// Services (these are the ones you showed)
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
	const uri = process.env.MONGO_URL || 'mongodb://localhost:27017/ntuarena';
	await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
}

async function pickUsers(count) {
	// grab more than needed and sample
	const users = await User.aggregate([{ $sample: { size: Math.max(count * 2, count + 5) } }]);
	return users.slice(0, count);
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
}

async function summarize(tournamentId) {
	const [players, games, ongoing, finished] = await Promise.all([
		Player.countDocuments({ tournament: tournamentId }),
		Game.countDocuments({ tournament: tournamentId }),
		Game.countDocuments({ tournament: tournamentId, isFinished: false }),
		Game.countDocuments({ tournament: tournamentId, isFinished: true }),
	]);
	return { players, games, ongoing, finished };
}

async function simulate() {
	await connectMongo();

	// 1) Admin creates tournament
	const t = await Tournament.create({
		name: randomName(),
		timeControl: '3+2',
		tournStatus: 'upcoming',
		createdAt: new Date(),
	});

	const TID = String(t._id);
	console.log('[SIM] Created tournament:', TID, '-', t.name);

	// 2) Admin registers users as players
	const PLAYER_COUNT = parseInt(process.env.SIM_PLAYERS || '24', 10);
	const users = await pickUsers(PLAYER_COUNT);
	if (users.length < 2) throw new Error('Not enough users to register as players.');

	await registerPlayers(TID, users);
	console.log(`[SIM] Registered ${users.length} players.`);

	// 3) Admin starts tournament (this seeds Redis queue & starts pairing worker via your service)
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

