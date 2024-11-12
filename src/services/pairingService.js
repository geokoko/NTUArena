const mongoose = require('mongoose');
const Player = require('../models/Player');
const Game = require('../models/Game');

const MAX_PENALTY_THRESHOLD = 5000;

function justPlayedTogether (player1, player2) {
    return player1.recent_opponents.includes(player2.id) || player2.recent_opponents.includes(player1.id);
}

function calculateColorScore (player) {
    const color_Threshold = 3; // penalizing repeated color choices after having one color occur three times more than the other
    const colorPenalty = 200;

    const countColor = (colorHistory, color) => colorHistory.filter(c => c === color).length;

    const playerWhite = countColor(player.colorHistory, 'white');``
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

    const colorScore1 = calculateColorScore(player1);
    const colorScore2 = calculateColorScore(player2);

    let colorPenalty = 0;

    if (colorScore1 >= 2*200 && colorScore2 >= 2*200 || colorScore1 <= -2*200 && colorScore2 <= -2*200) {
        colorPenalty = 2000;
    }

    return elo_difference + score_difference + colorPenalty;
}

function generatePairingScores(players) {
    const pairings = [];
    for (let i = 0; i < players.length - 1; i++) {
        for (let j = i + 1; j < players.length; j++) {
			if (justPlayedTogether(players[i], players[j])) continue;

            const player1 = players[i];
            const player2 = players[j];
            const score = pairingPenalty(player1, player2);
            pairings.push({ player1, player2, score });
        }
    }
    return pairings;
}

function sortPairsByScore(pairs) {
	pairs.sort((a, b) => a.score - b.score);
}

function greedyPairing(players) {
	const pairings = [];
	const pairedPlayers = new Set();

	const possiblePairs = generatePairingScores(players);
	const sortedPairs = sortPairsByScore(possiblePairs);

	for (const {player1, player2} of sortedPairs) {
		if (penalty > MAX_PENALTY_THRESHOLD) {
			continue;
		}
		if (!pairedPlayers.has(player1.id) && !pairedPlayers.has(player2.id)) {
			pairings.push({player1, player2});
			pairedPlayers.add(player1.id);
			pairedPlayers.add(player2.id);
		}
	}

	return pairings;
}
