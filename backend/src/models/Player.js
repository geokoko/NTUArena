const mongoose = require('mongoose');
const { createPublicId } = require('../utils/publicId');

const PlayerSchema = new mongoose.Schema({
	publicId: { type: String, unique: true, default: () => createPublicId() },
	user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, default: null },
	tempName: { type: String, default: null }, // Display name for temp players without user accounts
	tournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', required: true },
	score: { type: Number, required: true, default: 0 },
	liveRating: { type: Number, required: true, default: 0 },
	entryRating: { type: Number, default: 0 },
	isPlaying: { type: Boolean, default: false },
	waitingSince: { type: Date, default: Date.now },
	gameHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Game' }],
	colorHistory: [{ type: String, enum: ['white', 'black'] }],
	recentOpponents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
	status: { type: String, enum: ['active', 'paused', 'withdrawn'], default: 'active' },
	gamesPlayed: { type: Number, default: 0 },
	wins: { type: Number, default: 0 },
	draws: { type: Number, default: 0 },
	losses: { type: Number, default: 0 },
	sumOpponentRatings: { type: Number, default: 0 },
	enteredAt: { type: Date, default: Date.now },
	pausedAt: { type: Date, default: null },
	withdrawnAt: { type: Date, default: null },
	lastResultAt: { type: Date, default: null }
});

module.exports = mongoose.model('Player', PlayerSchema);
