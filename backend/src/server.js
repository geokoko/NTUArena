require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const connectDB = require('./config/database');

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
app.use(mongoSanitize());

// Rate limiting
// General limiter: 200 requests per 15 min per IP
const generalLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 200,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: 'Too many requests, please try again later.' },
});
app.use(generalLimiter);

// Strict limiter for auth endpoints: 20 requests per 15 min per IP
const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 20,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: 'Too many authentication attempts, please try again later.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Logging
if (process.env.NODE_ENV === 'production') {
	app.use(morgan('combined'));
} else {
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
app.use('*', (req, res) => res.status(404).json({ error: 'Route not found' }));

// Global error handler 
app.use((err, req, res, next) => {
	console.error(err);
	res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// backend port
const PORT = process.env.PORT || 5000;

// Start server after DB connection
connectDB()
	.then(() => {
		app.listen(PORT, () => {
			console.log(`Arena Monolith running on ${PORT}`);
		});
	})
	.catch(err => {
		console.error('Failed to start monolith:', err);
		process.exit(1);
	});


