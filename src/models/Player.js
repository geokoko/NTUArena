const mongoose = require('mongoose');

const PlayerSchema = new mongoose.Schema({
    first_name : { type : String, required : true },
    last_name : { type : String, required : true },
    elo : { type : Number, required : true },
    score : { type : Number, required : true, default : 0 },
    fideID : { type : Number },
    isPlaying : { type : Boolean, default : true },
    waitingSince : { type : Date, default : Date.now },
    gameHistory : [{ type : mongoose.Schema.Types.ObjectId, ref : 'Game' }],
    colorHistory : [{ type : String, enum : ['white', 'black'] }]
});

module.exports = mongoose.model('Player', PlayerSchema);