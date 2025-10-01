const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
	username: { type: String, required: true, unique: true },
	email: { type: String, required: true, unique: true },
	role: { type: String, enum: ['player', 'admin', 'spectator'], default: 'player' },
	fide_id: { type: Number, default: null },
	globalElo: { type: Number, default: 1000 },
	registeredAt: { type: Date, default: Date.now },
	isActive: { type: Boolean, default: true },
	profile: {
		firstName: { type: String, default: '' },
		lastName: { type: String, default: '' },
		country: { type: String, default: '' },
		city: { type: String, default: '' },
		birthDate: { type: Date, default: null },
		profilePicture: { type: String, default: '' }
	},
	statistics: {
		totalGames: { type: Number, default: 0 },
		totalWins: { type: Number, default: 0 },
		totalLosses: { type: Number, default: 0 },
		totalDraws: { type: Number, default: 0 },
		tournamentParticipations: { type: Number, default: 0 },
		tournamentWins: { type: Number, default: 0 }
	},
	settings: {
		emailNotifications: { type: Boolean, default: true },
		publicProfile: { type: Boolean, default: true },
		timezone: { type: String, default: 'UTC' }
	}
});

module.exports = mongoose.model('User', userSchema);

