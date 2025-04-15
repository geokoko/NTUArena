const userService = require('../services/userService');

exports.getUserById = async (req, res) => {
	const { id } = req.params;
	try {
        const user = await userService.getUserById(id);
        res.status(200).json({ user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateUser = async (req, res) => {
	const { id } = req.params;
	try {
		const user = await userService.updateUser(id, req.body);
		res.status(200).json({ user });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};

exports.addUser = async (req, res) => {
    try {
        const user = await userService.addUser(req.body);
        res.status(201).json({ user });
    }
    catch (err) {
        res.status(500).json({error: err.message});
    }
};

exports.deleteUser = async (req, res) => {
	const { id } = req.params;
	try {
		await userService.deleteUser(id);
		res.status(204).send();
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
};
