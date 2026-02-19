require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/database');

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
