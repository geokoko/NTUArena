const Player = require('../models/Player');
const rabbitmq = require('../utils/rabbitmq');

class PlayerService {
    constructor() {
        this.initializeEventHandlers();
    }

    async initializeEventHandlers() {
        // Listen for game events
        await rabbitmq.consumeEvents('game_events', 'game.finished', this.handleGameFinished.bind(this));
        await rabbitmq.consumeEvents('game_events', 'game.created', this.handleGameCreated.bind(this));
        
        // Listen for tournament events
        await rabbitmq.consumeEvents('tournament_events', 'tournament.player_joined', this.handleTournamentJoined.bind(this));
        await rabbitmq.consumeEvents('tournament_events', 'tournament.player_left', this.handleTournamentLeft.bind(this));
        
        // Listen for pairing events
        await rabbitmq.consumeEvents('pairing_events', 'pairing.player_available', this.handlePlayerAvailable.bind(this));
        await rabbitmq.consumeEvents('pairing_events', 'pairing.player_unavailable', this.handlePlayerUnavailable.bind(this));
    }

    async handleGameFinished(message) {
        console.log('Game finished:', message.data);
        const { whitePlayerId, blackPlayerId, result } = message.data;
        
        try {
            // Update player availability
            await Player.findByIdAndUpdate(whitePlayerId, { 
                isPlaying: false, 
                waitingSince: new Date() 
            });
            await Player.findByIdAndUpdate(blackPlayerId, { 
                isPlaying: false, 
                waitingSince: new Date() 
            });

            // Update color history
            const whitePlayer = await Player.findById(whitePlayerId);
            const blackPlayer = await Player.findById(blackPlayerId);
            
            if (whitePlayer) {
                whitePlayer.colorHistory.push('white');
                await whitePlayer.save();
            }
            
            if (blackPlayer) {
                blackPlayer.colorHistory.push('black');
                await blackPlayer.save();
            }

            // Publish player availability events
            await rabbitmq.publishEvent('player_events', 'player.available', {
                playerId: whitePlayerId,
                tournamentId: whitePlayer?.tournament
            });
            await rabbitmq.publishEvent('player_events', 'player.available', {
                playerId: blackPlayerId,
                tournamentId: blackPlayer?.tournament
            });

        } catch (error) {
            console.error('Error handling game finished:', error);
        }
    }

    async handleGameCreated(message) {
        console.log('Game created:', message.data);
        const { whitePlayerId, blackPlayerId, gameId } = message.data;
        
        try {
            // Mark players as playing
            await Player.findByIdAndUpdate(whitePlayerId, { isPlaying: true });
            await Player.findByIdAndUpdate(blackPlayerId, { isPlaying: true });
            
            // Add to game history
            await Player.findByIdAndUpdate(whitePlayerId, { 
                $push: { gameHistory: gameId } 
            });
            await Player.findByIdAndUpdate(blackPlayerId, { 
                $push: { gameHistory: gameId } 
            });

            // Update recent opponents
            await Player.findByIdAndUpdate(whitePlayerId, { 
                $addToSet: { recentOpponents: blackPlayerId } 
            });
            await Player.findByIdAndUpdate(blackPlayerId, { 
                $addToSet: { recentOpponents: whitePlayerId } 
            });

        } catch (error) {
            console.error('Error handling game created:', error);
        }
    }

    async handleTournamentJoined(message) {
        console.log('Tournament joined:', message.data);
        // Player creation is handled by tournament service
    }

    async handleTournamentLeft(message) {
        console.log('Tournament left:', message.data);
        // Player deletion is handled by tournament service
    }

    async handlePlayerAvailable(message) {
        console.log('Player available:', message.data);
        const { playerId } = message.data;
        
        try {
            await Player.findByIdAndUpdate(playerId, { 
                isPlaying: false, 
                waitingSince: new Date() 
            });
        } catch (error) {
            console.error('Error handling player available:', error);
        }
    }

    async handlePlayerUnavailable(message) {
        console.log('Player unavailable:', message.data);
        const { playerId } = message.data;
        
        try {
            await Player.findByIdAndUpdate(playerId, { isPlaying: true });
        } catch (error) {
            console.error('Error handling player unavailable:', error);
        }
    }

    async fetchPlayerStats(userId, tournamentId) {
        try {
            const player = await Player.findOne({ user: userId, tournament: tournamentId });
            
            if (!player) {
                throw new Error('Player not found');
            }

            return {
                playerId: player._id,
                userId: player.user,
                tournamentId: player.tournament,
                score: player.score,
                liveRating: player.liveRating,
                isPlaying: player.isPlaying,
                waitingSince: player.waitingSince,
                gamesPlayed: player.gameHistory.length,
                colorHistory: player.colorHistory
            };
        } catch (error) {
            console.error('Error fetching player stats:', error);
            throw error;
        }
    }

    async getPlayersByTournament(tournamentId) {
        try {
            const players = await Player.find({ tournament: tournamentId });
            return players;
        } catch (error) {
            console.error('Error getting players by tournament:', error);
            throw error;
        }
    }

    async updatePlayerAfterGame(playerId, gameId, gameResult) {
        try {
            const player = await Player.findById(playerId);
            if (!player) {
                throw new Error('Player not found');
            }

            // Update score based on result
            if (gameResult === 'win') {
                player.score += 1;
            } else if (gameResult === 'draw') {
                player.score += 0.5;
            }
            // Loss adds 0 points

            // Mark as not playing
            player.isPlaying = false;
            player.waitingSince = new Date();

            await player.save();

            // Publish player updated event
            await rabbitmq.publishEvent('player_events', 'player.updated', {
                playerId: player._id,
                tournamentId: player.tournament,
                score: player.score,
                isPlaying: player.isPlaying
            });

            return player;
        } catch (error) {
            console.error('Error updating player after game:', error);
            throw error;
        }
    }
}

module.exports = new PlayerService(); 