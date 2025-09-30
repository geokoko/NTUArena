require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/database');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.get('/health', (req, res) => { res.status(200).json({ service: 'arena-monolith', status: 'OK', timestamp: new Date().toISOString(), uptime: process.uptime() }); });

app.use('/api/users', require('./routes/users'));
app.use('/api/tournaments', require('./routes/tournaments'));
app.use('/api/games', require('./routes/games'));
app.use('/api/pairing', require('./routes/pairing'));

app.use('*', (req, res) => res.status(404).json({ error: 'Route not found' }));

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Arena Monolith running on ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to start monolith:', err);
  process.exit(1);
});

