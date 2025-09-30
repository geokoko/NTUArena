const userService = require('../services/userService');

class UserController {
	async getAll(req, res) {
		try {
			const users = await userService.getAllUsers();
			res.status(200).json({ users });
		} catch (e) {
			res.status(500).json({ error: e.message });
		}
	}

	async getById(req, res) {
		try {
			const user = await userService.getUserById(req.params.id);
			res.status(200).json({ user });
		} catch (e) {
			res.status(/not found/i.test(e.message) ? 404 : 500).json({ error: e.message });
		}
	}

	async add(req, res) {
		try {
			const user = await userService.addUser(req.body);
			res.status(201).json({ user });
		} catch (e) {
			res.status(400).json({ error: e.message });
		}
	}

	async update(req, res) {
		try {
			const user = await userService.updateUser(req.params.id, req.body);
			res.status(200).json({ user });
		} catch (e) {
			res.status(/not found/i.test(e.message) ? 404 : 400).json({ error: e.message });
		}
	}

	async remove(req, res) {
		try {
			await userService.deleteUser(req.params.id);
			res.status(204).send();
		} catch (e) {
			res.status(/not found/i.test(e.message) ? 404 : 400).json({ error: e.message });
		}
	}
}

module.exports = new UserController();


