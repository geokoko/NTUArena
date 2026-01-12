const User = require('../models/User');
const {
	findByIdOrPublicId,
	ensureDocumentPublicId,
} = require('../utils/identifiers');

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

class UserService {
	filterData(data) {
		if (!data || typeof data !== 'object') return {};

		const filtered = {};
		const directFields = ['username', 'email', 'password', 'role'];

		for (const field of directFields) {
			if (data[field] !== undefined) filtered[field] = data[field];
		}

		if (data.globalElo !== undefined) {
			const parsed = Number(data.globalElo);
			if (!Number.isFinite(parsed)) {
				throw new Error('globalElo must be a finite number');
			}
			filtered.globalElo = parsed;
		}

		const profileFields = ['firstName', 'lastName', 'country', 'city', 'birthDate', 'profilePicture'];
		const profile = {};

		if (data.profile && typeof data.profile === 'object') {
			for (const field of profileFields) {
				if (data.profile[field] !== undefined) {
					profile[field] = data.profile[field];
				}
			}
		}

		for (const field of ['firstName', 'lastName']) {
			if (data[field] !== undefined) profile[field] = data[field];
		}

		if (Object.keys(profile).length > 0) {
			filtered.profile = profile;
		}

		return filtered;
	}

	async getAllUsers() {
		const users = await User.find({ isDeleted: { $ne: true } });
		await Promise.all(users.map((user) => ensureDocumentPublicId(user, User)));
		return users.map(sanitizeUser);
	}

	async getUserById(id) {
		const user = await findByIdOrPublicId(User, id);
		if (!user || user.isDeleted) throw new Error('User not found');
		await ensureDocumentPublicId(user, User);
		return sanitizeUser(user);
	}

	async addUser(data) {
		const filtered = this.filterData(data);
		const user = new User(filtered);
		await user.save();
		await ensureDocumentPublicId(user, User);
		return sanitizeUser(user);
	}

	/**
	 * Player self-registration.
	 * Defaults role to 'player'.
	 */
	async registerUser(data) {
		const filtered = this.filterData({
			role: 'player',
			...data
		});
		return this.addUser(filtered);
	}

	async updateUser(id, data) {
		const user = await findByIdOrPublicId(User, id);
		if (!user || user.isDeleted) throw new Error('User not found');
		const filtered = this.filterData(data);
		Object.assign(user, filtered);
		await user.save();
		await ensureDocumentPublicId(user, User);
		return sanitizeUser(user);
	}

	async deleteUser(id) {
		const user = await findByIdOrPublicId(User, id);
		if (!user) throw new Error('User not found');
		user.isDeleted = true;
		user.isActive = false;
		user.deletedAt = new Date();
		await user.save();
		await ensureDocumentPublicId(user, User);
		return sanitizeUser(user);
	}

	async updateUserElo(id, newElo) {
		const user = await findByIdOrPublicId(User, id);
		if (!user || user.isDeleted) throw new Error('User not found');
		user.globalElo = newElo;
		await user.save();
		await ensureDocumentPublicId(user, User);
		return sanitizeUser(user);
	}

	/**
	 * Bulk add users from parsed CSV data.
	 * @param {Object[]} usersData - Array of user objects with username, email, etc.
	 * @returns {{ created: Object[], skipped: Object[], errors: Object[] }}
	 */
	async bulkAddUsers(usersData) {
		const results = {
			created: [],
			skipped: [],
			errors: [],
		};

		if (!Array.isArray(usersData) || usersData.length === 0) {
			return results;
		}

		// Pre-fetch existing usernames and emails for duplicate detection
		const existingUsers = await User.find({ isDeleted: { $ne: true } }).select('username email');
		const existingUsernames = new Set(existingUsers.map((u) => u.username?.toLowerCase()));
		const existingEmails = new Set(existingUsers.map((u) => u.email?.toLowerCase()));

		for (const userData of usersData) {
			const rowNum = userData._rowNumber || '?';

			try {
				// Check for duplicates
				const username = userData.username?.toLowerCase();
				const email = userData.email?.toLowerCase();

				if (existingUsernames.has(username)) {
					results.skipped.push({
						row: rowNum,
						reason: `Username '${userData.username}' already exists`,
						data: userData,
					});
					continue;
				}

				if (existingEmails.has(email)) {
					results.skipped.push({
						row: rowNum,
						reason: `Email '${userData.email}' already exists`,
						data: userData,
					});
					continue;
				}

				// Prepare user data
				const userToAdd = {
					username: userData.username,
					email: userData.email,
					role: userData.role || 'player',
				};

				// Add optional fields
				if (userData.globalelo) {
					userToAdd.globalElo = Number(userData.globalelo);
				}
				if (userData.firstname || userData.lastname) {
					userToAdd.profile = {};
					if (userData.firstname) userToAdd.profile.firstName = userData.firstname;
					if (userData.lastname) userToAdd.profile.lastName = userData.lastname;
				}

				const created = await this.addUser(userToAdd);
				results.created.push({
					row: rowNum,
					user: created,
				});

				// Track newly created for in-batch duplicate detection
				existingUsernames.add(username);
				existingEmails.add(email);
			} catch (err) {
				results.errors.push({
					row: rowNum,
					error: err.message || 'Unknown error',
					data: userData,
				});
			}
		}

		return results;
	}
}

module.exports = new UserService();

