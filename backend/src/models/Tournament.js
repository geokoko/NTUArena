const mongoose = require('mongoose');

const tournamentSchema = new mongoose.Schema({
	name: { type: String, required: true },
	tournLocation: { type: String },
	startDate: { type: Date, required: true },
	endDate: { type: Date, required: true },
	tournStatus: { type: String, enum: ['upcoming', 'in progress', 'completed'], default: 'upcoming' },
	participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
	scoreboard: [{
		player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
		score: { type: Number, default: 0 }
	}],
	games: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Game' }]
});

module.exports = mongoose.model('Tournament', tournamentSchema);

