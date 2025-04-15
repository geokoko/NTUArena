const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.registerUser = async (username, email, password) => {
    const emailExists = await User.findOne({ email });
    if (emailExists) {
        throw new Error('This email address is already associated with an account!');
    }
	const usernameExists = await User.findone({ username });
	if (usernameExists) {
		throw new Error('This username already exists!');
	}

	// Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

	// Create user
    const user = await User.create({ username, email, password: hashedPassword });

    return jwt.sign({ userId: user._id, role: user.role }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
};

exports.loginUser = async (email, password) => {
    const user = await User.findOne({ email });
    if (!user) {
        throw new Error('Invalid email address');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        throw new Error('Wrong password');
    }

    return jwt.sign({ userId: user._id, role: user.role }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
};
