const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();

// Security headers
app.use(helmet());

// CORS
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({
	origin: corsOrigin === '*' ? true : corsOrigin.split(',').map(s => s.trim()),
	credentials: true,
}));

// Body parsing 
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// NoSQL injection sanitization
// express-mongo-sanitize is incompatible with Express 5 (req.query is read-only),
// so we sanitize only req.body and req.params manually.
const sanitize = (obj) => {
	if (!obj || typeof obj !== 'object') return obj;
	for (const key of Object.keys(obj)) {
		if (key.startsWith('$')) {
			delete obj[key];
		} else if (typeof obj[key] === 'object') {
			sanitize(obj[key]);
		}
	}
	return obj;
};
app.use((req, res, next) => {
	if (req.body) sanitize(req.body);
	if (req.params) sanitize(req.params);
	next();
});

// Rate limiting (skip in test environment)
if (process.env.NODE_ENV !== 'test') {
	const generalLimiter = rateLimit({
		windowMs: 15 * 60 * 1000,
		max: 200,
		standardHeaders: true,
		legacyHeaders: false,
		message: { error: 'Too many requests, please try again later.' },
	});
	app.use(generalLimiter);

	const authLimiter = rateLimit({
		windowMs: 15 * 60 * 1000,
		max: 20,
		standardHeaders: true,
		legacyHeaders: false,
		message: { error: 'Too many authentication attempts, please try again later.' },
	});
	app.use('/api/auth/login', authLimiter);
	app.use('/api/auth/register', authLimiter);
}

// Logging
if (process.env.NODE_ENV === 'production') {
	app.use(morgan('combined'));
} else if (process.env.NODE_ENV !== 'test') {
	app.use(morgan('dev'));
}

// Health check route
app.get('/health', (req, res) => {
	res.status(200).json({
		service: 'arena-monolith',
		status: 'OK',
		timestamp: new Date().toISOString(),
		uptime: process.uptime()
	});
});

// API routes with /api prefix
app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/users'));
app.use('/api', require('./routes/tournaments'));
app.use('/api', require('./routes/games'));

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// Global error handler 
app.use((err, req, res, next) => {
	if (process.env.NODE_ENV !== 'test') {
		console.error(err);
	}
	res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

module.exports = app;
