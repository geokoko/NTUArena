const mongoose = require('mongoose');

const GameSchema = new mongoose.Schema({
	playerWhite: { type: mongoose.Schema.Types.ObjectId, required: true },
	playerBlack: { type: mongoose.Schema.Types.ObjectId, required: true },
	tournament: { type: mongoose.Schema.Types.ObjectId, required: true },
	isFinished: { type: Boolean, default: false },
	finishedAt: { type: Date },
	resultColor: { type: String, enum: ['white', 'draw', 'black'], default: null },
	createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Game', GameSchema);

