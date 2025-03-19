const mongoose = require('mongoose');
const Player = require('./Player');

const tournamentSchema = new mongoose.Schema({
	name: { type: String, required: true },
	location: { type: String, required: true },
	startDate: { type: Date, required: true },
	endDate: { type: Date, required: true },
	status: { type: String, enum: ['upcoming', 'in progress', 'completed'], default: 'upcoming' },
	participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
	scoreboard : [{
		player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
		score: { type: Number, default: 0 }
	}],
	games: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Game' }]
	//players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }]
});

module.exports = mongoose.model('Tournament', tournamentSchema);
