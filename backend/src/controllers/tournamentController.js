const asyncHandler = require('../middleware/asyncHandler');
const tournamentService = require('../services/tournamentService');
const { parseIdentifierCSV } = require('../utils/csvParser');

exports.createTournament = asyncHandler(async (req, res) => {
	const t = await tournamentService.createTournament(req.body);
	res.status(201).json(t);
});

exports.listTournaments = asyncHandler(async (req, res) => {
	const tournaments = await tournamentService.getAllTournaments();
	res.json(tournaments);
});

exports.deleteTournament = asyncHandler(async (req, res) => {
	const result = await tournamentService.deleteTournament(req.params.id);
	res.json(result);
});

exports.updateTournament = asyncHandler(async (req, res) => {
	const t = await tournamentService.updateTournament(req.params.id, req.body);
	res.json(t);
});

exports.startTournament = asyncHandler(async (req, res) => {
	const t = await tournamentService.startTournament(req.params.id);
	res.json(t);
});

exports.endTournament = asyncHandler(async (req, res) => {
	const t = await tournamentService.endTournament(req.params.id);
	res.json(t);
});

exports.viewTournament = asyncHandler(async (req, res) => {
	const t = await tournamentService.getTournamentById(req.params.id);
	res.json(t);
});

exports.getTournamentPlayers = asyncHandler(async (req, res) => {
	const players = await tournamentService.getTournamentPlayers(req.params.id);
	res.json(players);
});

exports.getTournamentGames = asyncHandler(async (req, res) => {
	const games = await tournamentService.getTournamentGames(req.params.id);
	res.json(games);
});

exports.getTournamentStandings = asyncHandler(async (req, res) => {
	const standings = await tournamentService.getTournamentStandings(req.params.id);
	res.json(standings);
});

// ---- Player actions ----
exports.joinTournament = asyncHandler(async (req, res) => {
	const userId = req.user?.id || req.body.userId; // prefer authed user; fallback body for testing
	if (!userId) {
		const err = new Error('userId is required');
		err.status = 400;
		throw err;
	}
	const player = await tournamentService.joinTournament(userId, req.params.id);
	res.status(201).json(player);
});

exports.leaveTournament = asyncHandler(async (req, res) => {
	const userId = req.user?.id || req.body.userId;
	if (!userId) {
		const err = new Error('userId is required');
		err.status = 400;
		throw err;
	}
	const result = await tournamentService.leaveTournament(userId, req.params.id);
	res.json(result);
});

// ---- Admin adds/removes players ----
exports.adminAddPlayer = asyncHandler(async (req, res) => {
	const { userId } = req.body;
	if (!userId) {
		const err = new Error('userId is required');
		err.status = 400;
		throw err;
	}
	const player = await tournamentService.adminAddPlayerToTournament(userId, req.params.id);
	res.status(201).json(player);
});

exports.adminRemovePlayer = asyncHandler(async (req, res) => {
	const { userId } = req.body;
	if (!userId) {
		const err = new Error('userId is required');
		err.status = 400;
		throw err;
	}
	const result = await tournamentService.adminRemovePlayerFromTournament(userId, req.params.id);
	res.json(result);
});

exports.pausePlayer = asyncHandler(async (req, res) => {
	const { userId } = req.body;
	if (!userId) {
		const err = new Error('userId is required');
		err.status = 400;
		throw err;
	}
	const player = await tournamentService.pausePlayer(userId, req.params.id);
	res.json(player);
});

exports.resumePlayer = asyncHandler(async (req, res) => {
	const { userId } = req.body;
	if (!userId) {
		const err = new Error('userId is required');
		err.status = 400;
		throw err;
	}
	const player = await tournamentService.resumePlayer(userId, req.params.id);
	res.json(player);
});

exports.importPlayersFromCSV = asyncHandler(async (req, res) => {
	const { csv } = req.body;
	const tournamentId = req.params.id;

	if (!csv || typeof csv !== 'string') {
		return res.status(400).json({ error: 'CSV content is required' });
	}

	// Parse CSV to get list of identifiers
	const parsed = parseIdentifierCSV(csv, 'identifier');

	if (parsed.errors.length > 0 && parsed.identifiers.length === 0) {
		return res.status(400).json({
			error: 'Failed to parse CSV',
			parseErrors: parsed.errors,
		});
	}

	// Bulk add players
	const results = await tournamentService.bulkAddPlayersByIdentifier(tournamentId, parsed.identifiers);

	res.json({
		success: true,
		parseErrors: parsed.errors,
		added: results.added.length,
		skipped: results.skipped.length,
		failed: results.errors.length,
		details: {
			added: results.added,
			skipped: results.skipped,
			errors: results.errors,
		},
	});
});
