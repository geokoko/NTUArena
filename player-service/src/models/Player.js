const mongoose = require('mongoose');

const PlayerSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, required: true }, // References user from user service
    tournament: { type: mongoose.Schema.Types.ObjectId, required: true }, // References tournament from tournament service
    score : { type : Number, required : true, default : 0 },
    liveRating : { type : Number, required : true },
    isPlaying : { type : Boolean, default : false },
    waitingSince : { type : Date, default : Date.now },
    gameHistory : [{ type : mongoose.Schema.Types.ObjectId }], // References games from game service
    colorHistory : [{ type : String, enum : ['white', 'black'] }],
    recentOpponents : [{ type : mongoose.Schema.Types.ObjectId, ref : 'Player' }]
});

module.exports = mongoose.model('Player', PlayerSchema); 