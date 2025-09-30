const User = require('../models/User');

class UserService {
	filterData(data) {
		const allowedFields = [
			'username', 'email', 'role', 'fide_id', 'globalElo',
			'profile.firstName', 'profile.lastName', 'profile.country',
			'profile.city', 'profile.birthDate', 'profile.profilePicture',
			'settings.emailNotifications', 'settings.publicProfile', 'settings.timezone'
		];
		const filteredData = {};
		for (const field of allowedFields) {
			if (field.includes('.')) {
				const [parent, child] = field.split('.');
				if (data[parent] && data[parent][child] !== undefined) {
					if (!filteredData[parent]) filteredData[parent] = {};
					filteredData[parent][child] = data[parent][child];
				}
			} else if (data[field] !== undefined) {
				filteredData[field] = data[field];
			}
		}
		return filteredData;
	}

	hasAllRequiredFields(data) {
		const requiredFields = ['username', 'email'];
		return requiredFields.every(field => data[field] !== undefined && data[field] !== '');
	}

	async getAllUsers() { return await User.find(); }

	async getUserById(id) {
		const user = await User.findById(id);
		if (!user) throw new Error('User not found');
		return user;
	}

	async addUser(data) {
		const filtered = this.filterData(data);
		if (!this.hasAllRequiredFields(filtered)) throw new Error('Missing required fields: username, email');
		const user = new User(filtered);
		await user.save();
		return user;
	}

	async updateUser(id, data) {
		const filtered = this.filterData(data);
		const user = await User.findByIdAndUpdate(id, { $set: filtered }, { new: true, runValidators: true });
		if (!user) throw new Error('User not found');
		return user;
	}

	async deleteUser(id) {
		const user = await User.findByIdAndUpdate(id, { isActive: false }, { new: true });
		if (!user) throw new Error('User not found');
		return user;
	}

	async searchUsers(query) {
		const searchRegex = new RegExp(query, 'i');
		return await User.find({
			$or: [
				{ username: searchRegex },
				{ email: searchRegex },
				{ 'profile.firstName': searchRegex },
				{ 'profile.lastName': searchRegex }
			],
			isActive: true
		}).select('-__v');
	}

	async getUserStatistics(id) {
		const user = await User.findById(id).select('statistics');
		if (!user) throw new Error('User not found');
		return user.statistics;
	}

	async updateUserElo(id, newElo) {
		const user = await User.findByIdAndUpdate(id, { globalElo: newElo }, { new: true });
		if (!user) throw new Error('User not found');
		return user;
	}
}

module.exports = new UserService();

