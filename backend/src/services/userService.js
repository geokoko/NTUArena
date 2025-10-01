const User = require('../models/User');

class UserService {
	filterData(data) {
		const allowed = ['username', 'email', 'password', 'role', 'globalElo'];
		return Object.fromEntries(
			Object.entries(data).filter(([key]) => allowed.includes(key))
		);
	}

	async getAllUsers() {
		return await User.find();
	}

	async getUserById(id) {
		const user = await User.findById(id);
		if (!user) throw new Error('User not found');
		return user;
	}

	async addUser(data) {
		const filtered = this.filterData(data);
		const user = new User(filtered);
		await user.save();
		return user;
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
		const filtered = this.filterData(data);
		const user = await User.findByIdAndUpdate(
			id,
			{ $set: filtered },
			{ new: true, runValidators: true }
		);
		if (!user) throw new Error('User not found');
		return user;
	}

	async deleteUser(id) {
		const user = await User.findByIdAndUpdate(
			id,
			{ isDeleted: true },
			{ new: true }
		);
		if (!user) throw new Error('User not found');
		return user;
	}

	async updateUserElo(id, newElo) {
		const user = await User.findByIdAndUpdate(
			id,
			{ globalElo: newElo },
			{ new: true }
		);
		if (!user) throw new Error('User not found');
		return user;
	}
}

module.exports = new UserService();

