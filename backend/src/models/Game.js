const mongoose = require('mongoose');
const { createPublicId } = require('../utils/publicId');

const GameSchema = new mongoose.Schema({
	publicId: { type: String, unique: true, default: () => createPublicId() },
	playerWhite: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
	playerBlack: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
	tournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', required: true },
	isFinished: { type: Boolean, default: false },
	finishedAt: { type: Date },
	resultColor: { type: String, enum: ['white', 'draw', 'black'] },
	createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Game', GameSchema);
