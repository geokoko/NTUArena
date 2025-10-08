const asyncHandler = require('../middleware/asyncHandler');
const tournamentService = require('../services/tournamentService');

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
