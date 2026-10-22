require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/database');
const tournamentScheduler = require('./services/tournamentScheduler');

// backend port
const PORT = process.env.PORT || 5000;

// Start server after DB connection
connectDB()
	.then(() => {
		app.listen(PORT, () => {
			console.log(`Arena Monolith running on ${PORT}`);
			tournamentScheduler.scheduleAll().catch((err) => {
				console.error('Tournament recovery failed:', err);
				tournamentScheduler.retryAll();
			});
		});
	})
	.catch(err => {
		console.error('Failed to start monolith:', err);
		process.exit(1);
	});
