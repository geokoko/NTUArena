const mongoose = require('mongoose');

function lifecycleFields(tournament) {
	const start = new Date(tournament.startDate);
	const end = new Date(tournament.endDate);
	const durationMs = end - start;
	if (!tournament.startDate || !tournament.endDate || !Number.isSafeInteger(durationMs) || durationMs <= 0) {
		throw new Error(`Tournament ${tournament._id} needs a valid legacy startDate/endDate before migration`);
	}
	return {
		durationMs,
		scheduledStartDate: tournament.scheduledStartDate ?? (tournament.tournStatus === 'upcoming' ? start : null),
		actualStartDate: tournament.actualStartDate ?? (tournament.tournStatus === 'upcoming' ? null : start),
	};
}

function performanceFields(player) {
	if (player.performanceRating != null || !(player.gamesPlayed > 0)) return null;
	if (!Number.isFinite(player.liveRating)) {
		throw new Error(`Player ${player._id} needs a numeric legacy liveRating before migration`);
	}
	return { performanceRating: player.liveRating };
}

async function migrateDatabase(db, { apply = false, log = console.log } = {}) {
	// Raw collections preserve legacy fields and missing values hidden by schema defaults.
	const tournaments = db.collection('tournaments');
	const players = db.collection('players');
	const playerFilter = { performanceRating: null, liveRating: { $exists: true }, gamesPlayed: { $gt: 0 } };
	const [legacyTournaments, legacyPlayers] = await Promise.all([
		tournaments.find({ durationMs: { $exists: false } }).toArray(),
		players.find(playerFilter).toArray(),
	]);
	// Validate both plans before any writes, including already migrated/completed tournaments' players.
	const tournamentPlan = legacyTournaments.map((t) => ({ id: t._id, fields: lifecycleFields(t) }));
	const playerPlan = legacyPlayers.map((p) => ({ player: p, fields: performanceFields(p) })).filter((p) => p.fields);
	let tournamentsUpdated = 0;
	let playersUpdated = 0;
	for (const { id, fields } of tournamentPlan) {
		log('Tournament', String(id), JSON.stringify(fields));
		if (apply) {
			const result = await tournaments.updateOne({ _id: id, durationMs: { $exists: false } }, { $set: fields });
			tournamentsUpdated += result.modifiedCount;
		}
	}
	for (const { player, fields } of playerPlan) {
		log('Player', String(player._id), JSON.stringify(fields));
		if (apply) {
			const result = await players.updateOne({
				_id: player._id, ...playerFilter, liveRating: player.liveRating, gamesPlayed: player.gamesPlayed,
			}, { $set: fields });
			playersUpdated += result.modifiedCount;
		}
	}
	log(apply
		? `Applied: ${tournamentsUpdated} tournament(s), ${playersUpdated} player performance(s).`
		: `Dry run: ${tournamentPlan.length} tournament(s), ${playerPlan.length} player performance(s).`);
}

async function migrate() {
	require('dotenv').config();
	if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
	await mongoose.connect(process.env.MONGO_URI, {
		dbName: process.env.MONGO_DB || 'ntuarena', serverSelectionTimeoutMS: 10000,
	});
	try {
		await migrateDatabase(mongoose.connection, { apply: process.argv.includes('--apply') });
	} finally {
		await mongoose.disconnect();
	}
}

if (require.main === module) migrate().catch((err) => {
	console.error(err.message);
	process.exitCode = 1;
});

module.exports = { lifecycleFields, performanceFields, migrateDatabase };
