// controllers/userController.js
const asyncHandler = require('../middleware/asyncHandler');
const userService = require('../services/userService');

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

