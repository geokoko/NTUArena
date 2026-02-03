const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { findByIdOrPublicId } = require('../utils/identifiers');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

/**
 * Middleware to require authentication.
 * Validates JWT from Authorization header and attaches user to req.user
 */
const requireAuth = async (req, res, next) => {
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
 * @param {...string} roles - Allowed roles
 */
const requireRole = (...roles) => {
	return (req, res, next) => {
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

module.exports = { requireAuth, requireRole };
