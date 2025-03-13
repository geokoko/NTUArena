const express = require('express');
const connectDB = require('./config/database');

require('dotenv').config({ path: __dirname + '/.env' });

const app = express();
app.use(express.json());

// Import routes
const tournamentRoutes = require('./routes/tournamentRoutes');
app.use('/tournaments', tournamentRoutes);

const playerRoutes = require('./routes/playerRoutes');
app.use('/players', playerRoutes);

const gameRoutes = require('./routes/gameRoutes');
app.use('/games', gameRoutes);

const userRoutes = require('./routes/userRoutes');
app.use('/users', userRoutes);

connectDB().then(() => {
	app.listen(5000, () => {
		console.log(`Server is running on port ${process.env.PORT}`);
	});
}).catch(err => {
	console.log("Failed to connect to database:", err.message);
	process.exit(1);
});
