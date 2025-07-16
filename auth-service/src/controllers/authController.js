const authService = require('../services/authService');

class AuthController {
    async register(req, res) {
        try {
            const { username, email, password } = req.body;
            
            if (!username || !email || !password) {
                return res.status(400).json({ 
                    error: 'Username, email, and password are required' 
                });
            }

            const result = await authService.registerUser(username, email, password);
            res.status(201).json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async login(req, res) {
        try {
            const { username, password } = req.body;
            
            if (!username || !password) {
                return res.status(400).json({ 
                    error: 'Username and password are required' 
                });
            }

            const result = await authService.loginUser(username, password);
            res.status(200).json(result);
        } catch (error) {
            res.status(401).json({ error: error.message });
        }
    }

    async logout(req, res) {
        try {
            const { userId } = req.body;
            
            if (!userId) {
                return res.status(400).json({ 
                    error: 'User ID is required' 
                });
            }

            const result = await authService.logoutUser(userId);
            res.status(200).json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    async validateToken(req, res) {
        try {
            const { token } = req.body;
            
            if (!token) {
                return res.status(400).json({ 
                    error: 'Token is required' 
                });
            }

            const result = await authService.validateToken(token);
            res.status(200).json(result);
        } catch (error) {
            res.status(401).json({ error: error.message });
        }
    }

    async refreshToken(req, res) {
        try {
            const { userId } = req.body;
            
            if (!userId) {
                return res.status(400).json({ 
                    error: 'User ID is required' 
                });
            }

            const result = await authService.refreshToken(userId);
            res.status(200).json(result);
        } catch (error) {
            res.status(401).json({ error: error.message });
        }
    }
}

module.exports = new AuthController(); 