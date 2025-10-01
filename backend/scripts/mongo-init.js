// seed/mongo-init.js
/* global db, ObjectId */

// ---------- Config ----------
const dbName  = process.env.MONGO_INITDB_DATABASE || 'ntuarena';
const appUser = process.env.MONGO_APP_USER || 'appuser';
const appPass = process.env.MONGO_APP_PASS || 'apppass';

// ---------- Helpers ----------
function ensureCollection(appDb, name) {
	if (appDb.getCollectionInfos({ name }).length === 0) {
		appDb.createCollection(name);
	}
}

function randInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randChoice(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
	}
	return arr;
}

// ---------- DB handle ----------
const appDb = db.getSiblingDB(dbName);

// Create app user once
if (!appDb.getUser(appUser)) {
	appDb.createUser({
		user: appUser,
		pwd: appPass,
		roles: [{ role: 'readWrite', db: dbName }],
	});
}

// Ensure collections exist
['users', 'players', 'tournaments', 'games'].forEach((c) =>
	ensureCollection(appDb, c)
);

// Indexes
appDb.users.createIndex({ email: 1 }, { unique: true });
appDb.players.createIndex({ user: 1, tournament: 1 }, { unique: true });
appDb.tournaments.createIndex({ status: 1 });
appDb.games.createIndex({ tournament: 1 });
appDb.games.createIndex({ whitePlayer: 1, blackPlayer: 1 });

// Seed only if empty
if (appDb.users.estimatedDocumentCount() === 0) {
	// ---------- Users ----------
	const famous = [
		{ username: 'magnus',  name: 'Magnus Carlsen',       email: 'magnus@example.com' },
		{ username: 'hikaru',  name: 'Hikaru Nakamura',      email: 'hikaru@example.com' },
		{ username: 'gukesh',  name: 'D. Gukesh',            email: 'gukesh@example.com' },
		{ username: 'ding',    name: 'Ding Liren',           email: 'ding@example.com' },
		{ username: 'fabi',    name: 'Fabiano Caruana',      email: 'fabi@example.com' },
		{ username: 'nepo',    name: 'Ian Nepomniachtchi',   email: 'nepo@example.com' },
		{ username: 'alireza', name: 'Alireza Firouzja',     email: 'alireza@example.com' },
		{ username: 'pragg',   name: 'R. Praggnanandhaa',    email: 'pragg@example.com' },
		{ username: 'erigaisi',name: 'Arjun Erigaisi',       email: 'erigaisi@example.com' },
		{ username: 'so',      name: 'Wesley So',            email: 'so@example.com' },
		{ username: 'giri',    name: 'Anish Giri',           email: 'giri@example.com' },
		{ username: 'nodi',    name: 'Nodirbek Abdusattorov',email: 'nodi@example.com' },
		{ username: 'mvL',     name: 'Maxime Vachier-Lagrave', email: 'mvl@example.com' },
		{ username: 'anand',   name: 'Viswanathan Anand',    email: 'anand@example.com' },
	];

	// Give every user a fixed _id so we can reference them
	const famousDocs = famous.map((u) => ({ _id: ObjectId(), ...u }));

	// Add a bunch of synthetic users
	const synthetic = [];
	for (let i = 1; i <= 60; i++) {
		synthetic.push({
			_id: ObjectId(),
			username: `user${i}`,
			name: `User ${i}`,
			email: `user${i}@example.com`,
		});
	}

	const userDocs = [...famousDocs, ...synthetic];
	appDb.users.insertMany(userDocs);

	const allUserIds = userDocs.map((u) => u._id);

	// ---------- Tournaments ----------
	const tournaments = [
		{ _id: ObjectId(), name: 'NTUArena Blitz #1',     timeControl: '3+2',   status: 'created',     createdAt: new Date() },
		{ _id: ObjectId(), name: 'NTUArena Rapid #1',     timeControl: '10+0',  status: 'in_progress', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24) },
		{ _id: ObjectId(), name: 'NTUArena Classical #1', timeControl: '15+10', status: 'completed',   createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7), completedAt: new Date() },
	];
	appDb.tournaments.insertMany(tournaments);

	// ---------- Players ----------
	function makePlayersForTournament(tourId, candidateUserIds, count) {
		const chosen = shuffle(candidateUserIds.slice()).slice(0, count);
		const playerDocs = chosen.map((userId) => {
			// 1200–2000 rating range
			const liveRating = 1200 + randInt(0, 800);
			// Pre-populate some color history (0–4 games)
			const histLen = randInt(0, 4);
			const colorHistory = Array.from({ length: histLen }, () =>
				randChoice(['white', 'black'])
			);
			const waitingSince =
				Math.random() < 0.5
					? new Date(Date.now() - randInt(30, 900) * 1000)
					: null;

			return {
				_id: ObjectId(),
				user: userId,
				tournament: tourId,
				liveRating,
				colorHistory,
				recentOpponents: [],
				...(waitingSince ? { waitingSince } : {}),
			};
		});

		appDb.players.insertMany(playerDocs);
		return playerDocs;
	}

	const blitzPlayers     = makePlayersForTournament(tournaments[0]._id, allUserIds, 20);
	const rapidPlayers     = makePlayersForTournament(tournaments[1]._id, allUserIds, 24);
	const classicalPlayers = makePlayersForTournament(tournaments[2]._id, allUserIds, 16);

	// ---------- Games ----------
	function createGamesForTournament(tour, players, opts) {
		const { totalPairs = 8, completedRatio = 0.7, pendingOk = true } = opts || {};
		const pairs = [];

		// Simple deterministic pairing: pair neighbors after shuffle
		const shuffled = shuffle(players.slice());
		for (let i = 0; i + 1 < shuffled.length && pairs.length < totalPairs; i += 2) {
			pairs.push([shuffled[i], shuffled[i + 1]]);
		}

		pairs.forEach(([pw, pb], idx) => {
			// Decide colors fairly: use colorScore heuristic (like your service)
			const whiteBias =
				(pw.colorHistory.filter((c) => c === 'white').length -
					pw.colorHistory.filter((c) => c === 'black').length) -
					(pb.colorHistory.filter((c) => c === 'white').length -
						pb.colorHistory.filter((c) => c === 'black').length);

			let whitePlayer = pw;
			let blackPlayer = pb;
			if (whiteBias > 0) {
				// pw has had more white; give pb white
				whitePlayer = pb;
				blackPlayer = pw;
			}

			const isCompleted =
				tour.status === 'completed' ||
					(tour.status === 'in_progress' && Math.random() < completedRatio);

			const result = isCompleted
				? randChoice(['1-0', '0-1', '1/2-1/2'])
				: (pendingOk ? 'pending' : '1/2-1/2');

			const gameDoc = {
				_id: ObjectId(),
				tournament: tour._id,
				whitePlayer: whitePlayer._id,
				blackPlayer: blackPlayer._id,
				result,
				createdAt: new Date(Date.now() - randInt(1, 3) * 60 * 60 * 1000),
			};

			appDb.games.insertOne(gameDoc);

			// Update color histories
			appDb.players.updateOne(
				{ _id: whitePlayer._id },
				{ $push: { colorHistory: 'white' } }
			);
			appDb.players.updateOne(
				{ _id: blackPlayer._id },
				{ $push: { colorHistory: 'black' } }
			);

			// Update recent opponents (store opponent USER id, as your pairing service expects)
			appDb.players.updateOne(
				{ _id: whitePlayer._id },
				{ $addToSet: { recentOpponents: blackPlayer.user } }
			);
			appDb.players.updateOne(
				{ _id: blackPlayer._id },
				{ $addToSet: { recentOpponents: whitePlayer.user } }
			);
		});
	}

	// Create games: a few for "created" (mostly pending), more for in_progress, full for completed
	createGamesForTournament(tournaments[0], blitzPlayers,     { totalPairs: 6, completedRatio: 0.2, pendingOk: true });
	createGamesForTournament(tournaments[1], rapidPlayers,     { totalPairs: 10, completedRatio: 0.6, pendingOk: true });
	createGamesForTournament(tournaments[2], classicalPlayers, { totalPairs: 8, completedRatio: 1.0, pendingOk: false });

	// Final counts
	const summary = {
		users: appDb.users.estimatedDocumentCount(),
		tournaments: appDb.tournaments.estimatedDocumentCount(),
		players: appDb.players.estimatedDocumentCount(),
		games: appDb.games.estimatedDocumentCount(),
	};
	print(`Seed completed for database "${dbName}".`);
	printjson(summary);
} else {
	print(`Database "${dbName}" already has users; skipping seed.`);
}

