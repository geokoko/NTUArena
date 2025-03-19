const userService = require('../services/userService');

const getAllUsers = async (req, res) => {
    try {
        const users = await userService.getAllUsers();
        res.status(200).json({ users });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const getUserById = async (req, res) => {
    try {
        const user = await userService.getUserById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.status(200).json({ user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const addUser = async (req, res) => {
    try {
        const user = await userService.addUser(req.body);
        await user.save();
        res.status(201).json({ user });
    }
    catch {
        res.status(500).json({error: err.message});
    }
}

module.exports = { getAllUsers, getUserById, addUser};

