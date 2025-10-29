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
}

module.exports = new UserService();

