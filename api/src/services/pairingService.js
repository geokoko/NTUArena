const Player = require('../models/Player');

class PairingService {
	justPlayedTogether(player1, player2) {
		const recentOpponents1 = player1.recentOpponents || [];
		const recentOpponents2 = player2.recentOpponents || [];
		return (
			recentOpponents1.some((op) => op.toString() === player2.user.toString()) ||
				recentOpponents2.some((op) => op.toString() === player1.user.toString())
		);
	}

	calculateColorScore(player) {
		const colorHistory = player.colorHistory || [];
		const whiteCount = colorHistory.filter((c) => c === 'white').length;
		const blackCount = colorHistory.filter((c) => c === 'black').length;
		const total = colorHistory.length;

		if (total === 0) return 0;

		let score = (whiteCount - blackCount) / total;

		if (colorHistory.length >= 2) {
			const last = colorHistory[colorHistory.length - 1];
			const prev = colorHistory[colorHistory.length - 2];
			if (last === prev) score += 0.3;
		}

		return score;
	}

	pairingPenalty(p1, p2) {
		let penalty = 0;

		const ratingDiff = Math.abs(p1.liveRating - p2.liveRating);
		penalty += ratingDiff * 0.001;

		if (this.justPlayedTogether(p1, p2)) penalty += 10;

		const c1 = this.calculateColorScore(p1);
		const c2 = this.calculateColorScore(p2);

		if (c1 > 0 && c2 > 0) penalty += 5;
			else if (c1 < 0 && c2 < 0) penalty += 5;

		const ws1 = p1.waitingSince ? (Date.now() - new Date(p1.waitingSince)) / 1000 : 0;
		const ws2 = p2.waitingSince ? (Date.now() - new Date(p2.waitingSince)) / 1000 : 0;
		penalty -= (ws1 + ws2) * 0.01;

		return penalty;
	}

	generatePairingScores(players) {
		const pairs = [];
		for (let i = 0; i < players.length; i++) {
			for (let j = i + 1; j < players.length; j++) {
				const p1 = players[i];
				const p2 = players[j];
				pairs.push({
					player1: p1,
					player2: p2,
					penalty: this.pairingPenalty(p1, p2),
				});
			}
		}
		return pairs.sort((a, b) => a.penalty - b.penalty);
	}

	greedyPairing(players) {
		if (players.length < 2) return [];

		const pairs = this.generatePairingScores(players);
		const paired = new Set();
		const out = [];

		for (const pair of pairs) {
			if (!paired.has(pair.player1.user) && !paired.has(pair.player2.user)) {
				const c1 = this.calculateColorScore(pair.player1);
				const c2 = this.calculateColorScore(pair.player2);

				let whitePlayer, blackPlayer;

				if (c1 > c2) {
					whitePlayer = pair.player2;
					blackPlayer = pair.player1;
				} else if (c2 > c1) {
					whitePlayer = pair.player1;
					blackPlayer = pair.player2;
				} else {
					if (Math.random() < 0.5) {
						whitePlayer = pair.player1;
						blackPlayer = pair.player2;
					} else {
						whitePlayer = pair.player2;
						blackPlayer = pair.player1;
					}
				}

				out.push({
					playerWhite: whitePlayer,
					playerBlack: blackPlayer,
					penalty: pair.penalty,
				});

				paired.add(pair.player1.user);
				paired.add(pair.player2.user);
			}
		}

		return out;
	}

	async generatePairings(tournamentId) {
		const players = await Player.find({ tournament: tournamentId });
		return this.greedyPairing(players);
	}
}

module.exports = new PairingService();

