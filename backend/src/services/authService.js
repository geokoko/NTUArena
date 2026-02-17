const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { findByIdOrPublicId, ensureDocumentPublicId } = require('../utils/identifiers');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const BCRYPT_ROUNDS = 12;

/** Escape special regex characters to prevent ReDoS / injection */
function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const toPlain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc || {});

const sanitizeUser = (userDoc) => {
	const user = toPlain(userDoc);
	return {
		id: user.publicId || null,
		username: user.username,
		email: user.email,
		role: user.role,
		globalElo: user.globalElo,
		profile: user.profile || {},
		statistics: user.statistics || {},
		settings: user.settings || {},
		registeredAt: user.registeredAt,
		isActive: user.isActive,
	};
};

class AuthService {
	/**
	 * Register a new user with password
	 */
	async register(data) {
		const { username, email, password, ...rest } = data;

		if (!username || !email || !password) {
			throw new Error('Username, email, and password are required');
		}

		if (password.length < 8) {
			throw new Error('Password must be at least 8 characters long');
		}

		// Check if user already exists
		const existingUser = await User.findOne({
			$or: [
				{ username: { $regex: new RegExp(`^${escapeRegex(username)}$`, 'i') } },
				{ email: { $regex: new RegExp(`^${escapeRegex(email)}$`, 'i') } }
			],
			isDeleted: { $ne: true }
		});

		if (existingUser) {
			if (existingUser.username.toLowerCase() === username.toLowerCase()) {
				throw new Error('Username already taken');
			}
			throw new Error('Email already registered');
		}

		// Hash password
		const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

		// Create user
		const user = new User({
			username,
			email,
			passwordHash,
			role: 'player',
			profile: rest.profile || {},
		});

		await user.save();
		await ensureDocumentPublicId(user, User);

		return sanitizeUser(user);
	}

	/**
	 * Login with username/email and password
	 */
	async login(identifier, password) {
		if (!identifier || !password) {
			throw new Error('Username/email and password are required');
		}

		// Find user by username or email
		const user = await User.findOne({
			$or: [
				{ username: { $regex: new RegExp(`^${escapeRegex(identifier)}$`, 'i') } },
				{ email: { $regex: new RegExp(`^${escapeRegex(identifier)}$`, 'i') } }
			],
			isDeleted: { $ne: true }
		});

		if (!user) {
			throw new Error('Invalid credentials');
		}

		if (!user.passwordHash) {
			throw new Error('Account not set up for password login. Please contact administrator.');
		}

		if (!user.isActive) {
			throw new Error('Account is deactivated');
		}

		// Verify password
		const isValid = await bcrypt.compare(password, user.passwordHash);
		if (!isValid) {
			throw new Error('Invalid credentials');
		}

		await ensureDocumentPublicId(user, User);

		// Generate token
		const token = this.generateToken(user);

		return {
			user: sanitizeUser(user),
			token,
		};
	}

	/**
	 * Generate JWT token for user
	 */
	generateToken(user) {
		return jwt.sign(
			{
				userId: user.publicId || user._id.toString(),
				role: user.role,
			},
			JWT_SECRET,
			{ expiresIn: JWT_EXPIRES_IN }
		);
	}

	/**
	 * Verify and decode JWT token
	 */
	verifyToken(token) {
		try {
			return jwt.verify(token, JWT_SECRET);
		} catch (err) {
			throw new Error('Invalid or expired token');
		}
	}

	/**
	 * Get user from token (for /me endpoint)
	 */
	async getUserFromToken(token) {
		const decoded = this.verifyToken(token);
		const user = await findByIdOrPublicId(User, decoded.userId);
		
		if (!user || user.isDeleted) {
			throw new Error('User not found');
		}

		await ensureDocumentPublicId(user, User);
		return sanitizeUser(user);
	}
}

module.exports = new AuthService();
