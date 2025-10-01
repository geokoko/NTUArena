const Player = require('../models/Player');
const Tournament = require('../models/Tournament');
const gameService = require('./gameService');

class PairingService {
	#loops = new Map(); // tournamentId -> setInterval handle

	justPlayedTogether(player1, player2) {
		const recentOpponents1 = player1.recentOpponents || [];
		return recentOpponents1.includes(player2.user);
	}

	colorImbalance(player, color) {
		const history = player.colorHistory || [];
		const lastColors = history.slice(-4);
		return lastColors.filter(c => c === color).length >= 3;
	}

	greedyPairing(players) {
		const out = [];
		const used = new Set();

		for (let i = 0; i < players.length; i++) {
			if (used.has(players[i]._id.toString())) continue;

			for (let j = i + 1; j < players.length; j++) {
				if (used.has(players[j]._id.toString())) continue;

				const p1 = players[i];
				const p2 = players[j];

				if (this.justPlayedTogether(p1, p2)) continue;

				// Decide colors (balance history)
				let white = p1, black = p2;
				if (this.colorImbalance(p1, 'white')) {
					white = p2;
					black = p1;
				} else if (this.colorImbalance(p2, 'black')) {
					white = p2;
					black = p1;
				}

				out.push({ playerWhite: white, playerBlack: black });
				used.add(p1._id.toString());
				used.add(p2._id.toString());
				break;
			}
		}

		return out;
	}

	async generatePairings(tournamentId) {
		const players = await Player.find({
			tournament: tournamentId,
			isPlaying: false
		});
		return this.greedyPairing(players);
	}

	async #oneCycle(tournamentId) {
		const t = await Tournament.findById(tournamentId).select('tournStatus');
		if (!t || t.tournStatus !== 'in progress') return;

		const pairings = await this.generatePairings(tournamentId);
		if (!pairings.length) return;

		for (const p of pairings) {
			await gameService.createGameFromPairing(
				p.playerWhite._id,
				p.playerBlack._id,
				tournamentId
			);
		}
	}

	startPairingLoop(tournamentId, intervalMs = 3000) {
		if (this.#loops.has(tournamentId)) return;
		const handle = setInterval(() => {
			this.#oneCycle(tournamentId).catch(() => {});
		}, intervalMs);
		this.#loops.set(tournamentId, handle);
	}

	stopPairingLoop(tournamentId) {
		const h = this.#loops.get(tournamentId);
		if (h) {
			clearInterval(h);
			this.#loops.delete(tournamentId);
		}
	}
}

module.exports = new PairingService();

