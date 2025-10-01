// controllers/tournamentController.js
const asyncHandler = require('../middleware/asyncHandler');
const tournamentService = require('../services/tournamentService');

exports.createTournament = asyncHandler(async (req, res) => {
	const t = await tournamentService.createTournament(req.body);
	res.status(201).json(t);
});

exports.deleteTournament = asyncHandler(async (req, res) => {
	const result = await tournamentService.deleteTournament(req.params.id);
	res.json(result);
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

// ---- Player actions ----
exports.joinTournament = asyncHandler(async (req, res) => {
	const userId = req.user?.id || req.body.userId; // prefer authed user; fallback body for testing
	const player = await tournamentService.joinTournament(userId, req.params.id);
	res.status(201).json(player);
});

exports.leaveTournament = asyncHandler(async (req, res) => {
	const userId = req.user?.id || req.body.userId;
	const result = await tournamentService.leaveTournament(userId, req.params.id);
	res.json(result);
});

// ---- Admin adds/removes players (same core logic, different authority) ----
exports.adminAddPlayer = asyncHandler(async (req, res) => {
	const { userId } = req.body;
	const player = await tournamentService.adminAddPlayerToTournament(userId, req.params.id);
	res.status(201).json(player);
});

exports.adminRemovePlayer = asyncHandler(async (req, res) => {
	const { userId } = req.body;
	const result = await tournamentService.adminRemovePlayerFromTournament(userId, req.params.id);
	res.json(result);
});

