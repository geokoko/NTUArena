const Game = require('../models/Game');
const rabbitmq = require('../utils/rabbitmq');

class GameService {
    constructor() {
        this.initializeEventHandlers();
    }

    async initializeEventHandlers() {
        // Listen for pairing events
        await rabbitmq.consumeEvents('pairing_events', 'pairing.created', this.handlePairingCreated.bind(this));
        
        // Listen for tournament events
        await rabbitmq.consumeEvents('tournament_events', 'tournament.started', this.handleTournamentStarted.bind(this));
        await rabbitmq.consumeEvents('tournament_events', 'tournament.ended', this.handleTournamentEnded.bind(this));
    }

    async handlePairingCreated(message) {
        console.log('Pairing created:', message.data);
        const { whitePlayerId, blackPlayerId, tournamentId } = message.data;
        
        try {
            // Create new game
            const game = new Game({
                playerWhite: whitePlayerId,
                playerBlack: blackPlayerId,
                tournament: tournamentId
            });
            
            await game.save();

            // Publish game created event
            await rabbitmq.publishEvent('game_events', 'game.created', {
                gameId: game._id,
                tournamentId: tournamentId,
                whitePlayerId: whitePlayerId,
                blackPlayerId: blackPlayerId
            });

            return game;
        } catch (error) {
            console.error('Error handling pairing created:', error);
        }
    }

    async handleTournamentStarted(message) {
        console.log('Tournament started:', message.data);
    }

    async handleTournamentEnded(message) {
        console.log('Tournament ended:', message.data);
        const { tournamentId } = message.data;
        
        try {
            // Mark all unfinished games as finished (could be forfeit, etc.)
            await Game.updateMany(
                { tournament: tournamentId, isFinished: false },
                { 
                    isFinished: true, 
                    finishedAt: new Date(),
                    resultColor: null // No result
                }
            );
        } catch (error) {
            console.error('Error handling tournament ended:', error);
        }
    }

    async submitGameResult(gameId, result) {
        try {
            const game = await Game.findById(gameId);
            if (!game) {
                throw new Error('Game not found');
            }

            if (game.isFinished) {
                throw new Error('Game already finished');
            }

            // Validate result
            if (!['white', 'black', 'draw'].includes(result)) {
                throw new Error('Invalid result. Must be white, black, or draw');
            }

            // Update game
            game.isFinished = true;
            game.finishedAt = new Date();
            game.resultColor = result;
            await game.save();

            // Publish game finished event
            await rabbitmq.publishEvent('game_events', 'game.finished', {
                gameId: game._id,
                tournamentId: game.tournament,
                whitePlayerId: game.playerWhite,
                blackPlayerId: game.playerBlack,
                result: result
            });

            return game;
        } catch (error) {
            console.error('Error submitting game result:', error);
            throw error;
        }
    }

    async fetchGameById(gameId) {
        try {
            const game = await Game.findById(gameId);
            if (!game) {
                throw new Error('Game not found');
            }
            return game;
        } catch (error) {
            console.error('Error fetching game:', error);
            throw error;
        }
    }

    async getGamesByTournament(tournamentId) {
        try {
            const games = await Game.find({ tournament: tournamentId });
            return games;
        } catch (error) {
            console.error('Error getting games by tournament:', error);
            throw error;
        }
    }

    async getActiveGamesByTournament(tournamentId) {
        try {
            const games = await Game.find({ 
                tournament: tournamentId, 
                isFinished: false 
            });
            return games;
        } catch (error) {
            console.error('Error getting active games by tournament:', error);
            throw error;
        }
    }

    async getGamesByPlayer(playerId) {
        try {
            const games = await Game.find({ 
                $or: [
                    { playerWhite: playerId },
                    { playerBlack: playerId }
                ]
            });
            return games;
        } catch (error) {
            console.error('Error getting games by player:', error);
            throw error;
        }
    }
}

module.exports = new GameService(); 