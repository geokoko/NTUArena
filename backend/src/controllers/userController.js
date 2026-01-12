// controllers/userController.js
const asyncHandler = require('../middleware/asyncHandler');
const userService = require('../services/userService');
const { parseCSV } = require('../utils/csvParser');

exports.register = asyncHandler(async (req, res) => {
	const user = await userService.registerUser(req.body);
	res.status(201).json(user);
});

// ---- Admin endpoints ----
exports.listUsers = asyncHandler(async (req, res) => {
	const users = await userService.getAllUsers();
	res.json(users);
});

exports.getUser = asyncHandler(async (req, res) => {
	const user = await userService.getUserById(req.params.id);
	res.json(user);
});

exports.createUser = asyncHandler(async (req, res) => {
	const user = await userService.addUser(req.body);
	res.status(201).json(user);
});

exports.updateUser = asyncHandler(async (req, res) => {
	const user = await userService.updateUser(req.params.id, req.body);
	res.json(user);
});

exports.deleteUser = asyncHandler(async (req, res) => {
	const user = await userService.deleteUser(req.params.id);
	res.json(user);
});

exports.updateUserElo = asyncHandler(async (req, res) => {
	const user = await userService.updateUserElo(req.params.id, req.body.globalElo);
	res.json(user);
});

exports.importUsersFromCSV = asyncHandler(async (req, res) => {
	const { csv } = req.body;

	if (!csv || typeof csv !== 'string') {
		return res.status(400).json({ error: 'CSV content is required' });
	}

	// Parse CSV with required and allowed columns
	const parsed = parseCSV(csv, {
		requiredColumns: ['username', 'email'],
		allowedColumns: ['username', 'email', 'role', 'globalelo', 'firstname', 'lastname'],
	});

	if (parsed.errors.length > 0 && parsed.data.length === 0) {
		return res.status(400).json({
			error: 'Failed to parse CSV',
			parseErrors: parsed.errors,
		});
	}

	// Bulk add users
	const results = await userService.bulkAddUsers(parsed.data);

	res.json({
		success: true,
		parseErrors: parsed.errors,
		created: results.created.length,
		skipped: results.skipped.length,
		failed: results.errors.length,
		details: {
			created: results.created,
			skipped: results.skipped,
			errors: results.errors,
		},
	});
});
