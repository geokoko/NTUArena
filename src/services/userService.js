const User = require('../models/User');

function filterData(data) {
	const allowedFields = ['username', 'email', 'password', 'fide_id', 'globalElo'];
	const filtered = {};

	for (const key of allowedFields) {
		if (key in data && data[key] !== null && data[key] !== undefined) {
			filtered[key] = data[key];
		}
	}

	return filtered;
}

function hasAllRequiredFields(data) {
	const requiredFields = ['username', 'email', 'password'];
	return requiredFields.every(field => field in data && data[field] !== null && data[field] !== undefined);
}

async function getUserById (id) {
    return await User.findById(id);
};

async function addUser (data) {
	const filteredData = filterData(data);

	if (!hasAllRequiredFields(filteredData)) {
		throw new Error('Missing required fields');
	}
	const existingUser = await User.findOne({ username: filteredData.username });
	if (existingUser) {
		throw new Error('Username already exists');
	}
	const existingEmail = await User.findOne({ email: filteredData.email });
	if (existingEmail) {
		throw new Error('Email already exists');
	}

	return await User.create(filteredData);
}

async function updateUser (id, data) {
	const filteredData = filterData(data);
	const user = await User.findByIdAndUpdate(id, filteredData, { new: true });
	if (!user) {
		throw new Error('User not found');
	}

	return user;
}

async function deleteUser (id) {
	return await User.findByIdAndDelete(id);
}

module.exports = { addUser, getUserById, updateUser, deleteUser };

