require('dotenv').config();

const mongoose = require('mongoose');
const crypto = require('crypto');

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

/**
 * Inserts simulated users into the database
 * Generates unique username/email pairs to avoid unique index conflicts.
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
			profile: { firstName: 'Sim', lastName: `User${i}`, country: 'GR', city: 'Athens' },
			statistics: {
				totalGames: 0, totalWins: 0, totalLosses: 0, totalDraws: 0,
				tournamentParticipations: 0, tournamentWins: 0,
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

async function pickUsers(count) {
	const users = await User.aggregate([{ $sample: { size: Math.max(count * 2, count + 6) } }]);
	users.sort(() => Math.random() - 0.5);
	return users.slice(0, count);
}

async function registerPlayers(tournamentId, users) {
	const now = new Date();
	const docs = users.map((u) => ({
		user: u._id,
		tournament: tournamentId,
		score: 0,
		liveRating: Number.isFinite(u.liveRating)
			? u.liveRating
			: Math.max(800, Math.round(1200 + (Math.random() - 0.5) * 600)),
		entryRating: Number.isFinite(u.liveRating)
			? u.liveRating
			: Math.max(800, Math.round(1200 + (Math.random() - 0.5) * 600)),
		isPlaying: false,
		waitingSince: now,
		gameHistory: [],
		colorHistory: [],
		recentOpponents: [],
	}));
	await Player.insertMany(docs, { ordered: false });

	let tournamentName = '';
	try {
		const tournament = await Tournament.findById(tournamentId).select('name').lean();
		tournamentName = tournament?.name || '';
	} catch (err) {
		console.warn('[SIM] registerPlayers could not fetch tournament name:', err.message);
	}

	const label = tournamentName ? `${tournamentName} (${tournamentId})` : tournamentId;
	console.log(`[SIM] Registered ${docs.length} players into tournament ${label}.`);
}

async function summarize(tournamentId) {
	const [players, games, ongoing, finished] = await Promise.all([
		Player.countDocuments({ tournament: tournamentId }),
		Game.countDocuments({ tournament: tournamentId }),
		Game.countDocuments({ tournament: tournamentId, isFinished: false }),
		Game.countDocuments({ tournament: tournamentId, isFinished: true }),
	]);

	let tournamentName = '';
	try {
		const tournament = await Tournament.findById(tournamentId).select('name').lean();
		tournamentName = tournament?.name || '';
	} catch (err) {
		console.warn('[SIM] summarize could not fetch tournament name:', err.message);
	}

	const label = tournamentName ? `${tournamentName} (${tournamentId})` : tournamentId;
	console.log(`[SIM] Tournament ${label} summary:`);
	console.log(`       Players:  ${players}`);
	console.log(`       Games:    ${games}`);
	console.log(`       Ongoing:  ${ongoing}`);
	console.log(`       Finished: ${finished}`);
	return { players, games, ongoing, finished };
}

/* =======================
   LOGGING UTILITIES
   ======================= */

let lastStandingsHash = '';

async function printStandingsIfChanged(tournamentId, topN = 10) {
	const players = await Player.find({ tournament: tournamentId })
		.populate('user', 'username')
		.sort({ score: -1, liveRating: -1 })
		.limit(topN)
		.lean();

	const snapshot = players.map(p => [p.user?.username, p.score, p.liveRating]);
	const hash = crypto.createHash('md5').update(JSON.stringify(snapshot)).digest('hex');
	if (hash === lastStandingsHash) return;
	lastStandingsHash = hash;

	const lines = players.map((p, i) =>
		`${String(i+1).padStart(2,' ')}. ${(p.user?.username || '-').padEnd(16)} `
			+ `${(p.score ?? 0).toFixed(1)} pts `
			+ `(LR ${p.liveRating ?? ''})`
	);

	console.log('[STANDINGS] Top ' + topN + '\n' + lines.join('\n'));
}

async function printFinalStandings(tournamentId, topN = 10) {
	const players = await Player.find({ tournament: tournamentId })
		.populate('user', 'username')
		.sort({ score: -1, liveRating: -1 })
		.limit(topN)
		.lean();

	const lines = players.map((p, i) =>
		`${String(i+1).padStart(2,' ')}. ${(p.user?.username || '-').padEnd(16)} `
			+ `${(p.score ?? 0).toFixed(1)} pts `
			+ `(LR ${p.liveRating ?? ''})`
	);

	console.log('[FINAL STANDINGS] Top ' + topN + '\n' + lines.join('\n'));
}

async function safeUserLookup(userId) {
	if (!userId) return null;
	try {
		return await User.findById(userId).select('username').lean();
	} catch (err) {
		console.warn('[SIM] safeUserLookup warning:', err.message);
		return null;
	}
}

async function resolveNamesFromGame(gameId) {
	try {
		const game = await Game.findById(gameId).lean();
		if (!game) return { whiteName: 'White?', blackName: 'Black?' };

		const [whitePlayer, blackPlayer] = await Promise.all([
			game.playerWhite ? Player.findById(game.playerWhite).lean() : null,
			game.playerBlack ? Player.findById(game.playerBlack).lean() : null,
		]);

		const [whiteUser, blackUser] = await Promise.all([
			safeUserLookup(whitePlayer?.user),
			safeUserLookup(blackPlayer?.user),
		]);

		const whiteName = whiteUser?.username || 'White?';
		const blackName = blackUser?.username || 'Black?';
		return { whiteName, blackName };
	} catch (err) {
		console.warn('[SIM] resolveNamesFromGame warning:', err.message);
		return { whiteName: 'White?', blackName: 'Black?' };
	}
}

/**
 * Watch new Game inserts and log pairings immediately.
 * Requires Mongo replica set for change streams.
 */
function watchPairings(tournamentId) {
	const pipeline = [
		{ $match: { operationType: 'insert' } },
		{ $addFields: { tournamentStr: { $toString: '$fullDocument.tournament' } } },
		{ $match: { tournamentStr: String(tournamentId) } },
	];
	const stream = Game.watch(pipeline, { fullDocument: 'updateLookup' });
	stream.on('change', async (change) => {
		const doc = change.fullDocument;
		const { whiteName, blackName } = await resolveNamesFromGame(doc._id);
		console.log(`[PAIR] ${whiteName} vs ${blackName}`);
	});
	stream.on('error', (err) => console.error('[PAIR] Change stream error:', err.message));
	return stream;
}

/**
 * Watch Game updates where isFinished flips to true; log result + refresh standings.
 */
function watchResults(tournamentId) {
	const pipeline = [
		{ $match: { operationType: 'update' } },
		{ $match: { 'updateDescription.updatedFields.isFinished': true } },
	];
	const stream = Game.watch(pipeline, { fullDocument: 'updateLookup' });
	stream.on('change', async (change) => {
		const game = change.fullDocument;
		if (String(game.tournament) !== String(tournamentId)) return;

		const { whiteName, blackName } = await resolveNamesFromGame(game._id);
		const resultLabel = { white: '1-0', black: '0-1', draw: '0.5-0.5' };
		const resStr = resultLabel[game.resultColor] || game.resultColor || '(no result)';
		console.log(`[RESULT] ${whiteName} vs ${blackName}: ${resStr}`);
		await printStandingsIfChanged(tournamentId, 10);
	});
	stream.on('error', (err) => console.error('[RESULT] Change stream error:', err.message));
	return stream;
}

/* =======================
   MAIN SIMULATOR
   ======================= */

async function simulate() {
	await connectMongo();

	// 1) Admin creates tournament
	const now = new Date();
	const start = new Date(now.getTime() + 15000); // 15 seconds from now
	const end   = new Date(start.getTime() + 2 * 60 * 1000); // 2 min after start
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

	// 3) Admin starts tournament (this seeds Redis queue & starts pairing worker)
	await tournamentService.startTournament(TID);
	console.log('[SIM] Tournament started. Pairing worker running...');

	// 3a) Start listeners for pairings and results (concise logs)
	const pairingStream = watchPairings(TID);
	const resultsStream = watchResults(TID);

	// 4) Periodically fetch some ongoing games and finish them, but STAGGER each finish
	const cycles = parseInt(process.env.SIM_CYCLES || '25', 10);
	const perCycleToFinish = parseInt(process.env.SIM_FINISH_PER_CYCLE || '6', 10);
	const cyclePauseMs = parseInt(process.env.SIM_CYCLE_DELAY_MS || '800', 10);

	// We'll track pending finish timers to avoid ending the tournament too early.
	let pendingFinishes = 0;
	const finishingGames = new Set();

	for (let c = 1; c <= cycles; c++) {
		await sleep(cyclePauseMs);

		// Fetch ongoing games
		const ongoing = await Game.find({ tournament: TID, isFinished: false })
			.select('_id')
			.limit(perCycleToFinish)
			.lean();

		if (ongoing.length === 0) {
			console.log(`[SIM] Cycle ${c}: no ongoing games found (yet).`);
			continue;
		}

		// Staggered endings: schedule each game result with a random delay
		for (const g of ongoing) {
			const gameId = String(g._id);
			if (finishingGames.has(gameId)) continue;
			finishingGames.add(gameId);
			const delayMs = 1500 + Math.floor(Math.random() * 5000); // 1.5s–6.5s
			pendingFinishes++;
			setTimeout(async () => {
				const result = randChoice(['1-0', '0-1', '1/2-1/2']);
				try {
					const liveGame = await Game.findById(g._id).select('isFinished resultColor');
					if (!liveGame) {
						console.warn(`[SIM] Game ${gameId} disappeared before result submission.`);
						return;
					}
					if (liveGame.isFinished) {
						console.log(`[SIM] Skipping game ${gameId}; already finished with result ${liveGame.resultColor || 'unknown'}.`);
						return;
					}
					await gameService.submitGameResult(g._id, result);
				} catch (e) {
					// Common race occured (but now fixed by tracking finishingGames once and storing them in an external Set): 
					// game finish scheduled in a cycle, but in the next one the db still has isFinished = false
					// so a second finish attempt is made
					// whichever timer hits first will succeed, the other will error out here
					// We just log and move on.
					console.warn('[SIM] submitGameResult warning:', e.message);
				} finally {
					pendingFinishes--;
					finishingGames.delete(gameId);
				}
			}, delayMs);
		}
	}

	// 4b) Wait until the arena becomes quiet (no ongoing or a time cap)
	const MAX_WAIT_MS = parseInt(process.env.SIM_MAX_WAIT_MS || '30000', 10); // 30s cap
	const QUIET_STREAK_TARGET = 4; // how many consecutive checks with no ongoing
	let quietStreak = 0;
	const waitStart = Date.now();

	while (Date.now() - waitStart < MAX_WAIT_MS) {
		const [ongoing, stillPending] = await Promise.all([
			Game.countDocuments({ tournament: TID, isFinished: false }),
			Promise.resolve(pendingFinishes),
		]);

		if (ongoing === 0 && stillPending === 0) {
			quietStreak++;
			if (quietStreak >= QUIET_STREAK_TARGET) break;
		} else {
			quietStreak = 0;
		}
		await sleep(1000);
	}

	// 5) End tournament
	await tournamentService.endTournament(TID);
	console.log('[SIM] Tournament ended.');

	// 6) Final standings snapshot
	await printFinalStandings(TID, 10);

	// 7) Summary
	const s = await summarize(TID);
	console.log('[SIM] Summary:', s);

	// Cleanup watchers and DB
	try { pairingStream?.close(); } catch {}
	try { resultsStream?.close(); } catch {}
	await mongoose.disconnect();
}

// Entrypoint
simulate().catch(async (err) => {
	console.error(err);
	try { await mongoose.disconnect(); } catch {}
	process.exit(1);
});
