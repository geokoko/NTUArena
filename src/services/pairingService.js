const mongoose = require('mongoose');
const Player = require('../models/Player');
const Game = require('../models/Game');

const MAX_PENALTY_THRESHOLD = 5000;

function justPlayedTogether (player1, player2) {
    return player1.recent_opponents.includes(player2.id) || player2.recent_opponents.includes(player1.id);
}

function calculateColorScore (player) {
    const COLOR_THRESHOLD = 3; // penalizing repeated color choices after having one color occur three times more than the other
    const COLOR_PENALTY = 200;

    const countColor = (colorHistory, color) => colorHistory.filter(c => c === color).length;

    const playerWhite = countColor(player.colorHistory, 'white');
    const playerBlack = countColor(player.colorHistory, 'black');

    let colorScore = 0;

    if (playerWhite - playerBlack > COLOR_THRESHOLD) {
        colorScore += COLOR_PENALTY;
    }

    if (playerBlack - playerWhite > COLOR_THRESHOLD) {
        colorScore -= COLOR_PENALTY;
    }

    return colorScore;
}

function pairingPenalty (player1, player2) {
    const elo_difference = Math.abs(player1.elo - player2.elo);
    const score_difference = Math.abs(player1.score - player2.score) * 1000;

    const colorScore1 = calculateColorScore(player1);
    const colorScore2 = calculateColorScore(player2);

    let colorPenalty = 0;
	const extremeThreshold = 2 * 200;

    if (
		(colorScore1 >= extremeThreshold && colorScore2 >= extremeThreshold) || 
		(colorScore1 <= -extremeThreshold && colorScore2 <= -extremeThreshold)
	) {
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
	return pairs.sort((a, b) => a.score - b.score);
}

function greedyPairing(players) {
	const pairings = [];
	const pairedPlayers = new Set();

	// Create a list of all possible pairs with penalties
	const possiblePairs = generatePairingScores(players);
	// Sort them by ascending penalty
	const sortedPairs = sortPairsByScore(possiblePairs);

	// Pick pairs from lowest to highest penalty
	for (const {player1, player2, score} of sortedPairs) {
		if (score > MAX_PENALTY_THRESHOLD) {
			// Skip if penalty is too large
			continue;
		}

		// skip if either player is already paired
        if (pairedPlayers.has(player1.id) || pairedPlayers.has(player2.id)) {
            continue;
        }

        // accept this pair
        pairings.push({ player1, player2 });
        pairedPlayers.add(player1.id);
        pairedPlayers.add(player2.id);
	}

	return pairings;
}
