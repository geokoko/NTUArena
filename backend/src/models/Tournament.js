const mongoose = require('mongoose');
const { createPublicId } = require('../utils/publicId');

const tournamentSchema = new mongoose.Schema({
	publicId: { type: String, unique: true, default: () => createPublicId() },
	name: { type: String, required: true },
	tournLocation: { type: String, default: '' },
	startDate: { type: Date, required: true },
	endDate: { type: Date, required: true },
	description: { type: String, default: '' },
	timeControl: { type: String, default: '' },
	type: { type: String, default: 'arena' },
	maxPlayers: { type: Number, default: 100 },
	tournStatus: { type: String, enum: ['upcoming', 'in progress', 'completed'], default: 'upcoming' },
	participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
	scoreboard: [{
		player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
		score: { type: Number, default: 0 }
	}]
});

module.exports = mongoose.model('Tournament', tournamentSchema);
