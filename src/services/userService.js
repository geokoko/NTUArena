const User = require('../models/User');

const getAllUsers = async () => {
    return await User.find();
};

const getUserById = async (id) => {
    return await User.findById(id);
};

const addUser = async (data) => {
    return await User.create(data);
}

module.exports = { getAllUsers, getUserById, addUser};

