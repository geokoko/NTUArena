const mongoose = require('mongoose');

const GameSchema = new mongoose.Schema({
    playerWhite : { type : mongoose.Schema.Types.ObjectId, ref : 'Player', required : true },
    playerBlack : { type : mongoose.Schema.Types.ObjectId, ref : 'Player', required : true },
    isFinished : { type : Boolean, default : false },
    resultColor : { type : String, enum: ['white', 'draw', 'black'], default : null },
});

module.exports = mongoose.model('Game', GameSchema);