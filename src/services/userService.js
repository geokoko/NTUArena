const User = require('../models/User');

const getAllUsers = async () => {
    return await User.find();
};

const getUserById = async (id) => {
    return await User.findById(id);
};

module.exports = { getAllUsers, getUserById };

