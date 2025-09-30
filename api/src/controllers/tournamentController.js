const tournamentService = require('../services/tournamentService');

class TournamentController {
	async create(req, res) {
		try {
			const t = await tournamentService.createTournament(req.body);
			res.status(201).json(t);
		} catch (e) {
			res.status(400).json({ error: e.message });
		}
	}

	async start(req, res) {
		try {
			const t = await tournamentService.startTournament(req.params.id);
			res.status(200).json(t);
		} catch (e) {
			res
				.status(/not|progress|started|completed/i.test(e.message) ? 409 : 404)
				.json({ error: e.message });
		}
	}

	async end(req, res) {
		try {
			const t = await tournamentService.endTournament(req.params.id);
			res.status(200).json(t);
		} catch (e) {
			res
				.status(/not|progress/i.test(e.message) ? 409 : 404)
				.json({ error: e.message });
		}
	}

	async getById(req, res) {
		try {
			const t = await tournamentService.getTournamentById(req.params.id);
			res.status(200).json(t);
		} catch (e) {
			res.status(404).json({ error: e.message });
		}
	}

	async standings(req, res) {
		try {
			const s = await tournamentService.getTournamentStandings(req.params.id);
			res.status(200).json(s);
		} catch (e) {
			res.status(404).json({ error: e.message });
		}
	}

	async join(req, res) {
		try {
			const p = await tournamentService.joinTournament(
				req.body.userId,
				req.params.id
			);
			res.status(200).json(p);
		} catch (e) {
			let code = 500;
			const msg = e.message || 'Error joining tournament';
			if (/not found/i.test(msg)) code = 404;
				else if (/already|started|completed/i.test(msg)) code = 409;
					else if (/invalid|missing/i.test(msg)) code = 400;
			res.status(code).json({ error: msg });
		}
	}

	async leave(req, res) {
		try {
			const r = await tournamentService.leaveTournament(
				req.body.userId,
				req.params.id
			);
			res.status(200).json(r);
		} catch (e) {
			res
				.status(/not found|missing|invalid/i.test(e.message) ? 404 : 400)
				.json({ error: e.message });
		}
	}

	async players(req, res) {
		try {
			const r =
				await tournamentService.getAllPlayersInTournament(req.params.id);
			res.status(200).json(r);
		} catch (e) {
			res.status(404).json({ error: e.message });
		}
	}

	async games(req, res) {
		try {
			const r = await tournamentService.getAllGamesInTournament(req.params.id);
			res.status(200).json(r);
		} catch (e) {
			res.status(404).json({ error: e.message });
		}
	}

	async active(req, res) {
		try {
			const r =
				await tournamentService.getAllActiveGamesInTournament(req.params.id);
			res.status(200).json(r);
		} catch (e) {
			res.status(404).json({ error: e.message });
		}
	}

	async list(req, res) {
		try {
			const r = await tournamentService.getAllTournaments();
			res.status(200).json(r);
		} catch (e) {
			res.status(500).json({ error: e.message });
		}
	}
}

module.exports = new TournamentController();

