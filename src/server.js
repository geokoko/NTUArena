const express = require('express');
const connectDB = require('./config/database');
const bodyParser = require('body-parser');

require('dotenv').config({ path: __dirname + '/.env' });

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const gameroutes = require('./routes/gameRoutes');
const playerroutes = require('./routes/playerRoutes');

app.use('/game', gameroutes);
app.use('/player', playerroutes);

connectDB().then(() => {
	app.listen(process.env.PORT, () => {
		console.log(`Server is running on port ${process.env.PORT}`);
	});
}).catch(err => {
	console.log("Failed to connect to database:", err.message);
	process.exit(1);
});
