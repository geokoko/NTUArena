// Validation utility functions
const validateServiceName = (serviceName) => {
	const validServices = ['auth', 'user', 'tournament', 'player', 'game', 'pairing'];
	return validServices.includes(serviceName);
};

const validateHealthResponse = (response) => {
	if (!response || typeof response !== 'object') {
		return false;
	}

	// Check for required fields
	return response.hasOwnProperty('status') && 
		response.hasOwnProperty('timestamp');
};

const sanitizeErrorMessage = (message) => {
	if (!message || typeof message !== 'string') {
		return 'Unknown error';
	}

	// Remove sensitive information from error messages
	return message
		.replace(/password/gi, '***')
		.replace(/token/gi, '***')
		.replace(/secret/gi, '***')
		.replace(/key/gi, '***');
};

const validateUrl = (url) => {
	try {
		new URL(url);
		return true;
	} catch (error) {
		return false;
	}
};

const validatePort = (port) => {
	const portNumber = parseInt(port, 10);
	return portNumber >= 1 && portNumber <= 65535;
};

const validateEnvironment = (env) => {
	const validEnvironments = ['development', 'staging', 'production', 'test'];
	return validEnvironments.includes(env);
};

// Request validation middleware
const validateRequest = (validationRules) => {
	return (req, res, next) => {
		const errors = [];

		Object.keys(validationRules).forEach(field => {
			const rules = validationRules[field];
			const value = req.body[field] || req.params[field] || req.query[field];

			if (rules.required && (!value || value === '')) {
				errors.push(`${field} is required`);
			}

			if (value && rules.type && typeof value !== rules.type) {
				errors.push(`${field} must be of type ${rules.type}`);
			}

			if (value && rules.minLength && value.length < rules.minLength) {
				errors.push(`${field} must be at least ${rules.minLength} characters long`);
			}

			if (value && rules.maxLength && value.length > rules.maxLength) {
				errors.push(`${field} must be no more than ${rules.maxLength} characters long`);
			}

			if (value && rules.pattern && !rules.pattern.test(value)) {
				errors.push(`${field} has invalid format`);
			}
		});

		if (errors.length > 0) {
			return res.status(400).json({
				error: 'Validation failed',
				details: errors,
				timestamp: new Date().toISOString()
			});
		}

		next();
	};
};

module.exports = {
	validateServiceName,
	validateHealthResponse,
	sanitizeErrorMessage,
	validateUrl,
	validatePort,
	validateEnvironment,
	validateRequest
}; 
