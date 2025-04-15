const mongoose = require('mongoose');
const Game = require('./Game');

const userSchema = new mongoose.Schema({
	username: { type: String, required: true, unique: true },
	email: { type: String, required: true, unique: true },
	password: { type: String, required: true }, // Hashed
	role: { type: String, enum: ['player', 'admin', 'spectator'], default: 'player' },
	fide_id: { type: Number, default: null },
	globalElo: { type: Number, default: 1000 },
	registeredAt: { type: Date, default: Date.now },
	gameHistory : [{ type : mongoose.Schema.Types.ObjectId, ref : 'Game' }]
});

module.exports = mongoose.model('User', userSchema);
