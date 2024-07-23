const Player = require('../models/Player');

exports.getPlayerCount = async (req, res) => {  
    try {
        const count = await Player.countDocuments();
        res.status(200).json({ count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getPlayers = async (req, res) => {
    try {
        const players = await Player.find();
        res.status(200).json({ players });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.addPlayer = async (req, res) => {
    try {
        const { first_name, last_name, elo } = req.body;
        const newPlayer = new Player({ first_name, last_name, elo });
        await newPlayer.save();
        res.status(201).json({ player: newPlayer });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.changePlayingState = async (req, res) => {
    try {
        const { playerID } = req.body;
        const player = await Player.findById(playerID);

        if (player) {
            player.isPlaying = !player.isPlaying;
            if (!player.isPlaying) {
                player.waitingSince = Date.now();
            } else {
                player.waitingSince = null;
            }
            await player.save();
            res.status(200).json({ player });
        } else {
            res.status(404).json({ message: 'Player not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }   
};

exports.deletePlayer = async (req, res) => {
    try {
        const { playerID } = req.body;
        const player = await Player.findById(playerID);

        if (player) {
            await player.remove();
            res.status(200).json({ message: 'Player removed' });
        } else {
            res.status(404).json({ message: 'Player not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}
