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
    colorHistory : [{ type : String, enum : ['white', 'black'] }],
    recentOpponents : [{ type : mongoose.Schema.Types.ObjectId, ref : 'Player' }]
});

PlayerSchema.virtual('fullName').get(function() {
    return `${this.first_name} ${this.last_name}`;
});

PlayerSchema.virtual('totalGames').get(function() {
    return this.gameHistory.length;
});

/*PlayerSchema.virtual('totalWins').get(function() {
    return this.gameHistory.filter(game => game.resultColor === this.colorHistory[this.gameHistory.indexOf(game)]).length;
});

PlayerSchema.virtual('totalDraws').get(function() {
    return this.gameHistory.filter(game => game.resultColor === 'draw').length;
});

PlayerSchema.virtual('totalLosses').get(function() {
    return this.totalGames - this.totalWins - this.totalDraws;
});

PlayerSchema.virtual('winRate').get(function() {
    if (this.totalGames === 0) {
        return 0;
    }
    return this.totalWins / this.totalGames;
});*/

PlayerSchema.methods.addRecentOpponent = async function (opponentId) {
    this.recentOpponents.push(opponentId);
    const playerCount = await mongoose.model('Player').countDocuments();
    if (this.recentOpponents.length > Math.floor(playerCount * 4)) {
        this.recentOpponents.shift();
    }
    return this.save();
}

PlayerSchema.methods.updateColorHistory = async function (color) {
    this.colorHistory.push(color);
    return this.save();
}

PlayerSchema.methods.updateScore = async function (resultColor) {
    if (resultColor === 'draw') {
        this.score += 0.5;
    } else if (resultColor === this.colorHistory[this.colorHistory.length - 1]) {
        this.score += 1;
    }
    return this.save();
}
module.exports = mongoose.model('Player', PlayerSchema);
