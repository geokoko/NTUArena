const tournamentService = require('../services/tournamentService');

class TournamentController {
    async createTournament(req, res) {
        try {
            const settings = req.body;
            const tournament = await tournamentService.createTournament(settings);
            res.status(201).json(tournament);
        } catch (error) {
            console.error('Error creating tournament:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async startTournament(req, res) {
        try {
            const { id } = req.params;
            const tournament = await tournamentService.startTournament(id);
            res.status(200).json(tournament);
        } catch (error) {
            console.error('Error starting tournament:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async endTournament(req, res) {
        try {
            const { id } = req.params;
            const tournament = await tournamentService.endTournament(id);
            res.status(200).json(tournament);
        } catch (error) {
            console.error('Error ending tournament:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async getTournamentById(req, res) {
        try {
            const { id } = req.params;
            const tournament = await tournamentService.getTournamentById(id);
            res.status(200).json(tournament);
        } catch (error) {
            console.error('Error getting tournament:', error);
            const message = (error && error.message) || 'Error fetching tournament';
            const status = /not found/i.test(message) ? 404 : 500;
            res.status(status).json({ error: message });
        }
    }

    async getTournamentStandings(req, res) {
        try {
            const { id } = req.params;
            const standings = await tournamentService.getTournamentStandings(id);
            res.status(200).json(standings);
        } catch (error) {
            console.error('Error getting tournament standings:', error);
            const message = (error && error.message) || 'Error fetching standings';
            const status = /not found/i.test(message) ? 404 : 500;
            res.status(status).json({ error: message });
        }
    }

    async joinTournament(req, res) {
        try {
            const { id } = req.params;
            const { userId } = req.body;
            const player = await tournamentService.joinTournament(userId, id);
            res.status(200).json(player);
        } catch (error) {
            console.error('Error joining tournament:', error);
            const msg = (error && error.message) || 'Error joining tournament';
            let status = 500;
            if (/not found/i.test(msg)) status = 404;
            else if (/already/i.test(msg) || /started|completed/i.test(msg)) status = 409;
            else if (/invalid|missing/i.test(msg)) status = 400;
            res.status(status).json({ error: msg });
        }
    }

    async leaveTournament(req, res) {
        try {
            const { id } = req.params;
            const { userId } = req.body;
            const result = await tournamentService.leaveTournament(userId, id);
            res.status(200).json(result);
        } catch (error) {
            console.error('Error leaving tournament:', error);
            const msg = (error && error.message) || 'Error leaving tournament';
            let status = 500;
            if (/not found/i.test(msg)) status = 404;
            else if (/invalid|missing/i.test(msg)) status = 400;
            res.status(status).json({ error: msg });
        }
    }

    async getAllPlayersInTournament(req, res) {
        try {
            const { id } = req.params;
            const players = await tournamentService.getAllPlayersInTournament(id);
            res.status(200).json(players);
        } catch (error) {
            console.error('Error getting players in tournament:', error);
            const message = (error && error.message) || 'Error fetching players';
            const status = /not found/i.test(message) ? 404 : 500;
            res.status(status).json({ error: message });
        }
    }

    async getAllGamesInTournament(req, res) {
        try {
            const { id } = req.params;
            const games = await tournamentService.getAllGamesInTournament(id);
            res.status(200).json(games);
        } catch (error) {
            console.error('Error getting games in tournament:', error);
            const message = (error && error.message) || 'Error fetching games';
            const status = /not found/i.test(message) ? 404 : 500;
            res.status(status).json({ error: message });
        }
    }

    async getAllActiveGamesInTournament(req, res) {
        try {
            const { id } = req.params;
            const games = await tournamentService.getAllActiveGamesInTournament(id);
            res.status(200).json(games);
        } catch (error) {
            console.error('Error getting active games in tournament:', error);
            const message = (error && error.message) || 'Error fetching active games';
            const status = /not found/i.test(message) ? 404 : 500;
            res.status(status).json({ error: message });
        }
    }

    async getAllTournaments(req, res) {
        try {
            const tournaments = await tournamentService.getAllTournaments();
            res.status(200).json(tournaments);
        } catch (error) {
            console.error('Error getting all tournaments:', error);
            const message = (error && error.message) || 'Error fetching tournaments';
            res.status(500).json({ error: message });
        }
    }
}

module.exports = new TournamentController(); 
