const mongoose = require('mongoose');
const Player = require('../models/Player');
const Game = require('../models/Game');
const quickselect = require('quickSelect');

function justPlayedTogether (player1, player2) {
    return player1.recent_opponents.includes(player2.id) || player2.recent_opponents.includes(player1.id);
}

function calculateColorScore (player) {
    const color_Threshold = 3; // penalizing repeated color choices after having one color occur three times more than the other
    const colorPenalty = 200;

    const countColor = (colorHistory, color) => colorHistory.filter(c => c === color).length;

    const playerWhite = countColor(player.colorHistory, 'white');
    const playerBlack = countColor(player.colorHistory, 'black');

    let colorScore = 0;

    if (playerWhite - playerBlack > color_Threshold) {
        colorScore += colorPenalty;
    }

    if (playerBlack - playerWhite > color_Threshold) {
        colorScore -= colorPenalty;
    }

    return colorScore;
}

function pairingPenalty (player1, player2) {
    const elo_difference = Math.abs(player1.elo - player2.elo);
    const score_difference = Math.abs(player1.score - player2.score) * 1000;

    const justPlayed = justPlayedTogether(player1, player2) ? 20000 : 0;
    const colorScore1 = calculateColorScore(player1);
    const colorScore2 = calculateColorScore(player2);

    let colorPenalty = 0;

    if (colorScore1 >= 200 && colorScore2 >= 200 || colorScore1 <= -200 && colorScore2 <= -200) {
        colorPenalty = 2000;
    }

    return elo_difference + score_difference + justPlayed + colorPenalty;
}

function generatePairingScores(players) {
    const pairings = [];
    for (let i = 0; i < players.length - 1; i++) {
        for (let j = i + 1; j < players.length; j++) {
            const player1 = players[i];
            const player2 = players[j];
            const score = pairingPenalty(player1, player2);
            pairings.push({ player1, player2, score });
        }
    }
    return pairings;
}

function findTopPair(pairings, usedPlayers) {
    const bestIndex = quickselect(pairings, 0, pairings.length - 1, 0); // finding the k-th smallest pair score
    const bestPair = pairings[k - 1];

    usedPlayers.add(bestPair.player1.id);
    usedPlayers.add(bestPair.player2.id);

    // Remove all pairs involving the selected players
    const filteredPairings = pairings.filter(pair => 
        !usedPlayers.has(pair.player1.id) && !usedPlayers.has(pair.player2.id)
    );

    return { bestPair, filteredPairings };
}