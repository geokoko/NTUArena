const userService = require('../services/userService');

class UserController {
    async getUserById(req, res) {
        try {
            const { id } = req.params;
            const user = await userService.getUserById(id);
            res.status(200).json({ user });
        } catch (error) {
            res.status(404).json({ error: error.message });
        }
    }

    async updateUser(req, res) {
        try {
            const { id } = req.params;
            const user = await userService.updateUser(id, req.body);
            res.status(200).json({ user });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async addUser(req, res) {
        try {
            const user = await userService.addUser(req.body);
            res.status(201).json({ user });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async deleteUser(req, res) {
        try {
            const { id } = req.params;
            await userService.deleteUser(id);
            res.status(204).send();
        } catch (error) {
            res.status(404).json({ error: error.message });
        }
    }

    async searchUsers(req, res) {
        try {
            const { query } = req.query;
            const users = await userService.searchUsers(query);
            res.status(200).json({ users });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async getUserStatistics(req, res) {
        try {
            const { id } = req.params;
            const statistics = await userService.getUserStatistics(id);
            res.status(200).json({ statistics });
        } catch (error) {
            res.status(404).json({ error: error.message });
        }
    }

    async updateUserElo(req, res) {
        try {
            const { id } = req.params;
            const { elo } = req.body;
            const user = await userService.updateUserElo(id, elo);
            res.status(200).json({ user });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
}

module.exports = new UserController(); 