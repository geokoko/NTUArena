require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/database');

const app = express();

// Security & parsing
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging (dev only is common; keep always-on if you prefer)
if (process.env.NODE_ENV !== 'production') {
	app.use(morgan('dev'));
}

// Health check
app.get('/health', (req, res) => {
	res.status(200).json({
		service: 'arena-monolith',
		status: 'OK',
		timestamp: new Date().toISOString(),
		uptime: process.uptime()
	});
});


app.use('/api', require('./routes/userRoutes'));
app.use('/api', require('./routes/tournamentRoutes'));
app.use('/api', require('./routes/gameRoutes'));

// 404 handler
app.use('*', (req, res) => res.status(404).json({ error: 'Route not found' }));

// Global error handler (keeps your controllers clean)
app.use((err, req, res, next) => {
	console.error(err); // swap with your logger in prod
	res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 5000;

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

