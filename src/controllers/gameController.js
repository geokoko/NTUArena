const Game = require('../models/Game');
const Player = require('../models/Player');

exports.createGame = async (req, res) => {
    try {
        const { playerWhiteId, playerBlackId } = req.body;
        const playerWhite = await Player.findById(playerWhiteId);
        const playerBlack = await Player.findById(playerBlackId);
        
        if (!playerWhite || !playerBlack) {
            return res.status(404).json({ message: 'Player not found' });
        }

        const newGame = new Game({ playerWhite: playerWhite._id, playerBlack: playerBlack._id });
        await newGame.save();

        playerWhite.isPlaying = true;
        playerBlack.isPlaying = true;
        playerWhite.gameHistory.push(newGame._id);
        playerBlack.gameHistory.push(newGame._id);
        playerWhite.colorHistory.push('white');
        playerBlack.colorHistory.push('black');

        await playerWhite.save();
        await playerBlack.save();

        res.status(201).json({ game: newGame });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

exports.finishGame = async (req, res) => {
    try {
        const { gameId, resultColor } = req.body;
        const game = await Game.findById(gameId);

        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }

        game.isFinished = true;
        game.resultColor = resultColor;
        await game.save();

        const playerWhite = await Player.findById(game.playerWhite);
        const playerBlack = await Player.findById(game.playerBlack);

        if (playerWhite) {
            playerWhite.isPlaying = false;
            playerWhite.waitingSince = Date.now();
            await playerWhite.save();
        }

        if (playerBlack) {
            playerBlack.isPlaying = false;
            playerBlack.waitingSince = Date.now();
            await playerBlack.save();
        }

        res.status(200).json({ game });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
