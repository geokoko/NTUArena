const mongoose = require('mongoose');
const { createPublicId } = require('../utils/publicId');

const GameSchema = new mongoose.Schema({
	publicId: { type: String, unique: true, default: () => createPublicId() },
	playerWhite: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
	playerBlack: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
	tournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', required: true },
	boardNumber: { type: Number, required: true },
	isFinished: { type: Boolean, default: false },
	finishedAt: { type: Date },
	resultColor: { type: String, enum: ['white', 'draw', 'black'] },
	isCancelled: { type: Boolean, default: false },
	cancelledAt: { type: Date },
	createdAt: { type: Date, default: Date.now }
});

GameSchema.index(
	{ tournament: 1, boardNumber: 1 },
	{
		unique: true,
		partialFilterExpression: {
			isFinished: false,
			isCancelled: false,
			boardNumber: { $type: 'number' },
		},
	}
);

module.exports = mongoose.model('Game', GameSchema);
