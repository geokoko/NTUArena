const Tournament = require('../models/Tournament');
const Player = require('../models/Player');
const Game = require('../models/Game');
const rabbitmq = require('../utils/rabbitmq');

class TournamentService {
    constructor() {
        this.initializeEventHandlers();
    }

    async initializeEventHandlers() {
        // Listen for user events
        await rabbitmq.consumeEvents('user_events', 'user.created', this.handleUserCreated.bind(this));
        await rabbitmq.consumeEvents('user_events', 'user.updated', this.handleUserUpdated.bind(this));
        
        // Listen for game events
        await rabbitmq.consumeEvents('game_events', 'game.finished', this.handleGameFinished.bind(this));
        await rabbitmq.consumeEvents('game_events', 'game.created', this.handleGameCreated.bind(this));
    }

    async handleUserCreated(message) {
        console.log('User created:', message.data);
        // No direct action needed for tournament service
    }

    async handleUserUpdated(message) {
        console.log('User updated:', message.data);
        // Update player rating if needed
        if (message.data.globalElo) {
            await Player.updateMany(
                { user: message.data.userId },
                { $set: { liveRating: message.data.globalElo } }
            );
        }
    }

    async handleGameFinished(message) {
        console.log('Game finished:', message.data);
        const { gameId, tournamentId, whitePlayerId, blackPlayerId, result } = message.data;
        
        try {
            // Update game in tournament
            await Game.findByIdAndUpdate(gameId, {
                isFinished: true,
                finishedAt: new Date(),
                resultColor: result
            });

            // Update player scores
            const whitePlayer = await Player.findById(whitePlayerId);
            const blackPlayer = await Player.findById(blackPlayerId);
            
            if (whitePlayer && blackPlayer) {
                if (result === 'white') {
                    whitePlayer.score += 1;
                } else if (result === 'black') {
                    blackPlayer.score += 1;
                } else if (result === 'draw') {
                    whitePlayer.score += 0.5;
                    blackPlayer.score += 0.5;
                }

                await whitePlayer.save();
                await blackPlayer.save();

                // Update tournament scoreboard
                const tournament = await Tournament.findById(tournamentId);
                if (tournament) {
                    const whiteEntry = tournament.scoreboard.find(entry => 
                        entry.player.toString() === whitePlayerId.toString()
                    );
                    const blackEntry = tournament.scoreboard.find(entry => 
                        entry.player.toString() === blackPlayerId.toString()
                    );

                    if (whiteEntry) whiteEntry.score = whitePlayer.score;
                    if (blackEntry) blackEntry.score = blackPlayer.score;

                    await tournament.save();
                }
            }

            // Publish tournament standings update
            await rabbitmq.publishEvent('tournament_events', 'tournament.standings_updated', {
                tournamentId,
                gameId,
                result
            });

        } catch (error) {
            console.error('Error handling game finished:', error);
        }
    }

    async handleGameCreated(message) {
        console.log('Game created:', message.data);
        const { gameId, tournamentId } = message.data;
        
        try {
            // Add game to tournament
            await Tournament.findByIdAndUpdate(tournamentId, {
                $push: { games: gameId }
            });
        } catch (error) {
            console.error('Error handling game created:', error);
        }
    }

    filterSettings(settings) {
        const allowedFields = ['name', 'tournLocation', 'startDate', 'endDate'];
        const filtered = {};

        // Check required fields first
        for (const key of allowedFields) {
            const value = settings[key];
            if (value === null || value === undefined || value === '') {
                throw new Error(`Missing required field: ${key}`);
            }
        }

        // Then filter out unwanted fields
        for (const key of allowedFields) {
            if (key in settings && settings[key] !== null && settings[key] !== undefined) {
                filtered[key] = settings[key];
            }
        }

        // Validate date logic
        const start = new Date(filtered.startDate);
        const end = new Date(filtered.endDate);
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            throw new Error('Invalid date format');
        }

        if (start >= end) {
            throw new Error('Start date must be before end date');
        }

        return filtered;
    }

    async createTournament(settings) {
        try {
            const filteredSettings = this.filterSettings(settings);
            const tournament = new Tournament(filteredSettings);
            await tournament.save();

            // Publish tournament created event
            await rabbitmq.publishEvent('tournament_events', 'tournament.created', {
                tournamentId: tournament._id,
                name: tournament.name,
                startDate: tournament.startDate,
                endDate: tournament.endDate,
                location: tournament.tournLocation
            });

            return tournament;
        } catch (error) {
            console.error('Error creating tournament:', error);
            throw error;
        }
    }

    async startTournament(tournamentId) {
        try {
            const tournament = await Tournament.findById(tournamentId);
            if (!tournament) {
                throw new Error('Tournament not found');
            }

            if (tournament.tournStatus !== 'upcoming') {
                throw new Error('Tournament already started or completed');
            }

            tournament.tournStatus = 'in progress';
            await tournament.save();

            // Publish tournament started event
            await rabbitmq.publishEvent('tournament_events', 'tournament.started', {
                tournamentId: tournament._id,
                name: tournament.name,
                participantCount: tournament.participants.length
            });

            return tournament;
        } catch (error) {
            console.error('Error starting tournament:', error);
            throw error;
        }
    }

    async endTournament(tournamentId) {
        try {
            const tournament = await Tournament.findById(tournamentId);
            if (!tournament) {
                throw new Error('Tournament not found');
            }

            if (tournament.tournStatus !== 'in progress') {
                throw new Error('Tournament not in progress');
            }

            tournament.tournStatus = 'completed';
            await tournament.save();

            // Publish tournament ended event
            await rabbitmq.publishEvent('tournament_events', 'tournament.ended', {
                tournamentId: tournament._id,
                name: tournament.name,
                finalStandings: tournament.scoreboard
            });

            return tournament;
        } catch (error) {
            console.error('Error ending tournament:', error);
            throw error;
        }
    }

    async getTournamentById(tournamentId) {
        try {
            const tournament = await Tournament.findById(tournamentId)
                .populate('participants')
                .populate('games');

            if (!tournament) {
                throw new Error('Tournament not found');
            }

            return tournament;
        } catch (error) {
            console.error('Error getting tournament:', error);
            throw error;
        }
    }

    async joinTournament(userId, tournamentId) {
        try {
            const tournament = await Tournament.findById(tournamentId);
            if (!tournament) {
                throw new Error('Tournament not found');
            }

            if (tournament.tournStatus !== 'upcoming') {
                throw new Error('Tournament already started or completed');
            }

            // Check if user already joined
            const existingPlayer = await Player.findOne({ user: userId, tournament: tournamentId });
            if (existingPlayer) {
                throw new Error('User already joined the tournament');
            }

            // Get user info from user service
            const userInfo = await rabbitmq.requestResponse('user_service_queue', {
                action: 'getUserById',
                userId: userId
            });

            if (!userInfo || !userInfo.success) {
                throw new Error('User not found');
            }

            const newPlayer = new Player({
                user: userId,
                tournament: tournamentId,
                liveRating: userInfo.user.globalElo || 1000
            });

            await newPlayer.save();

            tournament.participants.push(newPlayer._id);
            tournament.scoreboard.push({ player: newPlayer._id, score: 0 });
            await tournament.save();

            // Publish tournament joined event
            await rabbitmq.publishEvent('tournament_events', 'tournament.player_joined', {
                tournamentId: tournament._id,
                playerId: newPlayer._id,
                userId: userId
            });

            return newPlayer;
        } catch (error) {
            console.error('Error joining tournament:', error);
            throw error;
        }
    }

    async leaveTournament(userId, tournamentId) {
        try {
            const tournament = await Tournament.findById(tournamentId);
            if (!tournament) {
                throw new Error('Tournament not found');
            }

            const player = await Player.findOne({ user: userId, tournament: tournamentId });
            if (!player) {
                throw new Error('Player not found in tournament');
            }

            await Player.deleteOne({ _id: player._id });

            tournament.participants = tournament.participants.filter(id => 
                id.toString() !== player._id.toString()
            );
            tournament.scoreboard = tournament.scoreboard.filter(scoreEntry => 
                scoreEntry.player.toString() !== player._id.toString()
            );
            
            await tournament.save();

            // Publish tournament left event
            await rabbitmq.publishEvent('tournament_events', 'tournament.player_left', {
                tournamentId: tournament._id,
                playerId: player._id,
                userId: userId
            });

            return { message: 'Player left tournament successfully' };
        } catch (error) {
            console.error('Error leaving tournament:', error);
            throw error;
        }
    }

    async getAllPlayersInTournament(tournamentId) {
        try {
            const players = await Player.find({ tournament: tournamentId });
            return players;
        } catch (error) {
            console.error('Error getting players in tournament:', error);
            throw error;
        }
    }

    async getAllGamesInTournament(tournamentId) {
        try {
            const games = await Game.find({ tournament: tournamentId })
                .populate('playerWhite playerBlack');
            return games;
        } catch (error) {
            console.error('Error getting games in tournament:', error);
            throw error;
        }
    }

    async getAllActiveGamesInTournament(tournamentId) {
        try {
            const players = await Player.find({ tournament: tournamentId }).select('_id');
            const playerIds = players.map(p => p._id);

            const games = await Game.find({ 
                tournament: tournamentId,
                isFinished: false,
                $or: [
                    { playerWhite: { $in: playerIds } },
                    { playerBlack: { $in: playerIds } }
                ]
            }).populate('playerWhite playerBlack');

            return games;
        } catch (error) {
            console.error('Error getting active games in tournament:', error);
            throw error;
        }
    }

    async getTournamentStandings(tournamentId) {
        try {
            const tournament = await Tournament.findById(tournamentId)
                .populate({
                    path: 'participants',
                    select: 'user score liveRating gameHistory'
                });

            if (!tournament) {
                throw new Error('Tournament not found');
            }

            // Sort players by score in descending order
            const standings = tournament.participants
                .map(player => ({
                    playerId: player._id,
                    userId: player.user,
                    score: player.score,
                    liveRating: player.liveRating,
                    gamesPlayed: player.gameHistory.length
                }))
                .sort((a, b) => b.score - a.score);

            return standings;
        } catch (error) {
            console.error('Error getting tournament standings:', error);
            throw error;
        }
    }
}

module.exports = new TournamentService(); 