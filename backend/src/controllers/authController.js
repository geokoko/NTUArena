const asyncHandler = require('../middleware/asyncHandler');
const authService = require('../services/authService');

/**
 * POST /api/auth/register
 * Register a new user
 */
exports.register = asyncHandler(async (req, res) => {
	const user = await authService.register(req.body);
	res.status(201).json({
		success: true,
		user,
	});
});

/**
 * POST /api/auth/login
 * Login with username/email and password
 */
exports.login = asyncHandler(async (req, res) => {
	const { username, email, password } = req.body;
	const identifier = username || email;
	
	const result = await authService.login(identifier, password);
	res.json({
		success: true,
		user: result.user,
		token: result.token,
	});
});

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
exports.getMe = asyncHandler(async (req, res) => {
	// req.user is set by requireAuth middleware
	const user = req.user;
	
	res.json({
		success: true,
		user: {
			id: user.publicId || user._id,
			username: user.username,
			email: user.email,
			role: user.role,
			globalElo: user.globalElo,
			profile: user.profile || {},
			statistics: user.statistics || {},
			settings: user.settings || {},
			registeredAt: user.registeredAt,
			isActive: user.isActive,
		},
	});
});
