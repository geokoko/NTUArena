const mongoose = require('mongoose');

const tournamentLogSchema = new mongoose.Schema({
	tournamentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', required: true, index: true },
	roundNumber: { type: Number, default: null },
	eventType: { type: String, required: true, index: true },
	message: { type: String, default: '' },
	payload: { type: mongoose.Schema.Types.Mixed, default: null },
	actor: {
		userId: { type: String, default: null },
		username: { type: String, default: null },
	},
	createdAt: { type: Date, default: Date.now, index: true },
});

tournamentLogSchema.index({ tournamentId: 1, createdAt: -1 });
tournamentLogSchema.index({ tournamentId: 1, eventType: 1 });
tournamentLogSchema.index({ tournamentId: 1, roundNumber: 1 });

module.exports = mongoose.model('TournamentLog', tournamentLogSchema);
