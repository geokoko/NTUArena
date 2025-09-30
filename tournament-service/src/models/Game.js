const mongoose = require('mongoose');

// ACTS AS A CACHE FOR GAMES PLAYED IN A TOURNAMENT

const GameSchema = new mongoose.Schema({
    playerWhite : { type : mongoose.Schema.Types.ObjectId, required : true }, // References player from player service
    playerBlack : { type : mongoose.Schema.Types.ObjectId, required : true }, // References player from player service
    tournament : { type : mongoose.Schema.Types.ObjectId, required : true }, // References tournament from tournament service
    isFinished : { type : Boolean, default : false },
    finishedAt : { type : Date },
    resultColor : { type : String, enum: ['white', 'draw', 'black'], default : null },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Game', GameSchema); 
