const authService = require('../services/authService');

exports.register = async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const token = await authService.registerUser(username, email, password);
        res.status(201).json({ token });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.login = async (req, res) => {
    const { username, password } = req.body;
    try {
        const token = await authService.loginUser(username, password);
        res.status(200).json({ token });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.logout = async (req, res) => {
	try {
		await authService.logoutUser(req.user.id);
		res.status(200).json({ message: 'Successfully logged out' });
	} catch (error) {
		res.status(400).json({ error: error.message });
	}
};
