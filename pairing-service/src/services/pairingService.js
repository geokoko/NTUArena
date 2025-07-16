const rabbitmq = require('../utils/rabbitmq');

class PairingService {
    constructor() {
        this.availablePlayers = new Map();
        this.initializeEventHandlers();
    }

    async initializeEventHandlers() {
        // Listen for player availability events
        await rabbitmq.consumeEvents('player_events', 'player.available', this.handlePlayerAvailable.bind(this));
        await rabbitmq.consumeEvents('player_events', 'player.unavailable', this.handlePlayerUnavailable.bind(this));
        
        // Listen for pairing requests
        await rabbitmq.consumeEvents('pairing_events', 'pairing.request', this.handlePairingRequest.bind(this));
    }

    async handlePlayerAvailable(message) {
        const { playerId, playerData } = message.data;
        this.availablePlayers.set(playerId, playerData);
        console.log(`Player ${playerId} is now available for pairing`);
    }

    async handlePlayerUnavailable(message) {
        const { playerId } = message.data;
        this.availablePlayers.delete(playerId);
        console.log(`Player ${playerId} is no longer available for pairing`);
    }

    async handlePairingRequest(message) {
        const { tournamentId } = message.data;
        const pairings = await this.generatePairings(tournamentId);
        
        // Publish pairing results
        await rabbitmq.publishEvent('pairing_events', 'pairing.result', {
            tournamentId,
            pairings
        });
    }

    justPlayedTogether(player1, player2) {
        const recentOpponents1 = player1.recentOpponents || [];
        const recentOpponents2 = player2.recentOpponents || [];
        
        return recentOpponents1.some(opponent => opponent.toString() === player2.user.toString()) ||
               recentOpponents2.some(opponent => opponent.toString() === player1.user.toString());
    }

    calculateColorScore(player) {
        const colorHistory = player.colorHistory || [];
        const countColor = (colorHistory, color) => colorHistory.filter(c => c === color).length;
        
        const whiteCount = countColor(colorHistory, 'white');
        const blackCount = countColor(colorHistory, 'black');
        const totalGames = colorHistory.length;
        
        if (totalGames === 0) return 0;
        
        const colorBalance = (whiteCount - blackCount) / totalGames;
        
        let lastColorPenalty = 0;
        if (colorHistory.length >= 2) {
            const lastColor = colorHistory[colorHistory.length - 1];
            const secondLastColor = colorHistory[colorHistory.length - 2];
            
            if (lastColor === secondLastColor) {
                lastColorPenalty = 0.3;
            }
        }
        
        return colorBalance + lastColorPenalty;
    }

    pairingPenalty(player1, player2) {
        let penalty = 0;
        
        // Rating difference penalty
        const ratingDiff = Math.abs(player1.liveRating - player2.liveRating);
        penalty += ratingDiff * 0.001;
        
        // Recent opponent penalty
        if (this.justPlayedTogether(player1, player2)) {
            penalty += 10;
        }
        
        // Color balance penalty
        const colorScore1 = this.calculateColorScore(player1);
        const colorScore2 = this.calculateColorScore(player2);
        
        if (colorScore1 > 0 && colorScore2 > 0) {
            penalty += 5;
        } else if (colorScore1 < 0 && colorScore2 < 0) {
            penalty += 5;
        }
        
        // Waiting time bonus
        const waitingTime1 = player1.waitingSince ? 
            (new Date() - new Date(player1.waitingSince)) / 1000 : 0;
        const waitingTime2 = player2.waitingSince ? 
            (new Date() - new Date(player2.waitingSince)) / 1000 : 0;
        
        penalty -= (waitingTime1 + waitingTime2) * 0.01;
        
        return penalty;
    }

    generatePairingScores(players) {
        const pairs = [];
        
        for (let i = 0; i < players.length; i++) {
            for (let j = i + 1; j < players.length; j++) {
                const player1 = players[i];
                const player2 = players[j];
                
                const penalty = this.pairingPenalty(player1, player2);
                
                pairs.push({
                    player1: player1,
                    player2: player2,
                    penalty: penalty
                });
            }
        }
        
        return pairs;
    }

    sortPairsByScore(pairs) {
        return pairs.sort((a, b) => a.penalty - b.penalty);
    }

    greedyPairing(players) {
        if (players.length < 2) return [];
        
        const pairs = this.generatePairingScores(players);
        const sortedPairs = this.sortPairsByScore(pairs);
        
        const pairedPlayers = new Set();
        const finalPairings = [];
        
        for (const pair of sortedPairs) {
            if (!pairedPlayers.has(pair.player1.user) && !pairedPlayers.has(pair.player2.user)) {
                // Determine colors based on color scores
                const colorScore1 = this.calculateColorScore(pair.player1);
                const colorScore2 = this.calculateColorScore(pair.player2);
                
                let whitePlayer, blackPlayer;
                
                if (colorScore1 > colorScore2) {
                    whitePlayer = pair.player2;
                    blackPlayer = pair.player1;
                } else if (colorScore2 > colorScore1) {
                    whitePlayer = pair.player1;
                    blackPlayer = pair.player2;
                } else {
                    // Random assignment if equal color scores
                    if (Math.random() < 0.5) {
                        whitePlayer = pair.player1;
                        blackPlayer = pair.player2;
                    } else {
                        whitePlayer = pair.player2;
                        blackPlayer = pair.player1;
                    }
                }
                
                finalPairings.push({
                    playerWhite: whitePlayer,
                    playerBlack: blackPlayer,
                    penalty: pair.penalty
                });
                
                pairedPlayers.add(pair.player1.user);
                pairedPlayers.add(pair.player2.user);
            }
        }
        
        return finalPairings;
    }

    async generatePairings(tournamentId) {
        try {
            // Get available players for this tournament
            const tournamentPlayers = Array.from(this.availablePlayers.values())
                .filter(player => player.tournament && player.tournament.toString() === tournamentId);
            
            if (tournamentPlayers.length < 2) {
                return [];
            }
            
            const pairings = this.greedyPairing(tournamentPlayers);
            
            console.log(`Generated ${pairings.length} pairings for tournament ${tournamentId}`);
            
            return pairings;
        } catch (error) {
            console.error('Error generating pairings:', error);
            throw error;
        }
    }

    async requestPairing(tournamentId) {
        try {
            const pairings = await this.generatePairings(tournamentId);
            
            // Publish pairing results
            await rabbitmq.publishEvent('pairing_events', 'pairing.result', {
                tournamentId,
                pairings
            });
            
            return pairings;
        } catch (error) {
            console.error('Error requesting pairing:', error);
            throw error;
        }
    }

    getAvailablePlayers() {
        return Array.from(this.availablePlayers.values());
    }

    getPlayerCount() {
        return this.availablePlayers.size;
    }
}

module.exports = new PairingService(); 