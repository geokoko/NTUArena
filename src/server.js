const express = require('express');
const connectDB = require('./config/database');
const bodyParser = require('body-parser');

require('dotenv').config();

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const gameroutes = require('./routes/gameRoutes');
const playerroutes = require('./routes/playerRoutes');

app.use('/game', gameroutes);
app.use('/player', playerroutes);

app.listen(3000, () => { 
    console.log('Server is running on port 3000');
    connectDB();
});