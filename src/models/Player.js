const mongoose = require('mongoose');

const PlayerSchema = new mongoose.Schema({
	user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
	tournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', required: true },
    score : { type : Number, required : true, default : 0 },
	liveRating : { type : Number, required : true },
    isPlaying : { type : Boolean, default : true },
    waitingSince : { type : Date, default : Date.now },
    gameHistory : [{ type : mongoose.Schema.Types.ObjectId, ref : 'Game' }],
    colorHistory : [{ type : String, enum : ['white', 'black'] }],
    recentOpponents : [{ type : mongoose.Schema.Types.ObjectId, ref : 'Player' }]
});
