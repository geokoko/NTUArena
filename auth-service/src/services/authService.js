const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const rabbitmq = require('../utils/rabbitmq');

class AuthService {
    async registerUser(username, email, password) {
        try {
            // Check if user already exists
            const emailExists = await User.findOne({ email });
            if (emailExists) {
                throw new Error('This email address is already associated with an account!');
            }
            
            const usernameExists = await User.findOne({ username });
            if (usernameExists) {
                throw new Error('This username already exists!');
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Create user
            const user = await User.create({ username, email, password: hashedPassword });

            // Publish user creation event asynchronously (non-blocking)
            setImmediate(async () => {
                try {
                    await rabbitmq.publishEvent('user_events', 'user.created', {
                        userId: user._id,
                        username: user.username,
                        email: user.email,
                        role: user.role,
                        globalElo: user.globalElo,
                        registeredAt: user.registeredAt
                    });
                } catch (error) {
                    console.warn('Failed to publish user creation event:', error.message);
                }
            });

            // Generate JWT token
            const token = jwt.sign(
                { userId: user._id, role: user.role }, 
                process.env.ACCESS_TOKEN_SECRET, 
                { expiresIn: '24h' }
            );

            return {
                token,
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role
                }
            };
        } catch (error) {
            console.error('Registration error:', error);
            throw error;
        }
    }

    async loginUser(username, password) {
        try {
            const user = await User.findOne({ username, isActive: true });
            if (!user) {
                throw new Error('Invalid username or password');
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                throw new Error('Invalid username or password');
            }

            // Publish login event asynchronously (non-blocking)
            setImmediate(async () => {
                try {
                    await rabbitmq.publishEvent('auth_events', 'user.logged_in', {
                        userId: user._id,
                        username: user.username,
                        loginTime: new Date().toISOString()
                    });
                } catch (error) {
                    console.warn('Failed to publish login event:', error.message);
                }
            });

            // Generate JWT token
            const token = jwt.sign(
                { userId: user._id, role: user.role }, 
                process.env.ACCESS_TOKEN_SECRET, 
                { expiresIn: '24h' }
            );

            return {
                token,
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role
                }
            };
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    async logoutUser(userId) {
        try {
                    // Publish logout event asynchronously (non-blocking)
        setImmediate(async () => {
            try {
                await rabbitmq.publishEvent('auth_events', 'user.logged_out', {
                    userId: userId,
                    logoutTime: new Date().toISOString()
                });
            } catch (error) {
                console.warn('Failed to publish logout event:', error.message);
            }
        });

            return { message: 'Logout successful' };
        } catch (error) {
            console.error('Logout error:', error);
            throw error;
        }
    }

    async validateToken(token) {
        try {
            const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
            const user = await User.findById(decoded.userId);
            
            if (!user || !user.isActive) {
                throw new Error('User not found or inactive');
            }

            return {
                userId: user._id,
                username: user.username,
                email: user.email,
                role: user.role
            };
        } catch (error) {
            console.error('Token validation error:', error);
            throw error;
        }
    }

    async refreshToken(userId) {
        try {
            const user = await User.findById(userId);
            if (!user || !user.isActive) {
                throw new Error('User not found or inactive');
            }

            const token = jwt.sign(
                { userId: user._id, role: user.role }, 
                process.env.ACCESS_TOKEN_SECRET, 
                { expiresIn: '24h' }
            );

            return { token };
        } catch (error) {
            console.error('Token refresh error:', error);
            throw error;
        }
    }
}

module.exports = new AuthService(); 