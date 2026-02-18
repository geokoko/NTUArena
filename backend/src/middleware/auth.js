const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { findByIdOrPublicId } = require('../utils/identifiers');

if (!process.env.JWT_SECRET) {
	console.error('FATAL: JWT_SECRET environment variable is not set. Exiting.');
	process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * When AUTH_ENABLED=false, all auth middleware is bypassed
 * and a mock admin user is injected into every request.
 * Default: true (auth is enforced).
 */
const AUTH_ENABLED = process.env.AUTH_ENABLED !== 'false';

if (!AUTH_ENABLED) {
	console.warn('\n⚠️  AUTH_ENABLED=false — Authentication is DISABLED. All requests will run as a mock admin user.\n');
}

const DEV_MOCK_USER = {
	_id: 'dev-user',
	publicId: 'dev-user',
	username: 'dev-admin',
	email: 'dev@localhost',
	role: 'admin',
	isActive: true,
	isDeleted: false,
	globalElo: 0,
	profile: { firstName: 'Dev', lastName: 'Admin' },
	statistics: {},
	settings: {},
	registeredAt: new Date(),
};

/**
 * Middleware to require authentication.
 * Validates JWT from Authorization header and attaches user to req.user.
 * Bypassed when AUTH_ENABLED=false.
 */
const requireAuth = async (req, res, next) => {
	// Bypass: inject mock admin user when auth is disabled
	if (!AUTH_ENABLED) {
		req.user = DEV_MOCK_USER;
		req.userId = DEV_MOCK_USER.publicId;
		return next();
	}

	try {
		const authHeader = req.headers.authorization;
		
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return res.status(401).json({ error: 'Authentication required' });
		}

		const token = authHeader.split(' ')[1];
		
		if (!token) {
			return res.status(401).json({ error: 'Authentication required' });
		}

		const decoded = jwt.verify(token, JWT_SECRET);
		
		const user = await findByIdOrPublicId(User, decoded.userId);
		
		if (!user || user.isDeleted) {
			return res.status(401).json({ error: 'User not found' });
		}

		if (!user.isActive) {
			return res.status(401).json({ error: 'User account is deactivated' });
		}

		req.user = user;
		req.userId = user.publicId || user._id;
		next();
	} catch (err) {
		if (err.name === 'JsonWebTokenError') {
			return res.status(401).json({ error: 'Invalid token' });
		}
		if (err.name === 'TokenExpiredError') {
			return res.status(401).json({ error: 'Token expired' });
		}
		console.error('Auth middleware error:', err);
		return res.status(500).json({ error: 'Authentication error' });
	}
};

/**
 * Middleware factory to require a specific role.
 * Must be used after requireAuth.
 * Bypassed when AUTH_ENABLED=false (mock user is admin).
 * @param {...string} roles - Allowed roles
 */
const requireRole = (...roles) => {
	return (req, res, next) => {
		// Bypass: mock user is admin, always passes
		if (!AUTH_ENABLED) {
			return next();
		}

		if (!req.user) {
			return res.status(401).json({ error: 'Authentication required' });
		}

		if (!roles.includes(req.user.role)) {
			return res.status(403).json({ 
				error: 'Access denied',
				message: 'You do not have permission to access this resource'
			});
		}

		next();
	};
};

module.exports = { requireAuth, requireRole, AUTH_ENABLED };

