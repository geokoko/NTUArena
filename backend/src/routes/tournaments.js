// routes/tournamentRoutes.js
const express = require('express');
const router = express.Router();
//const { requireAuth, requireRole } = require('../middleware/auth');
const tCtrl = require('../controllers/tournamentController');

// ----- Public / Player route -----
router.get('/tournaments', tCtrl.listTournaments);
router.get('/tournaments/:id', tCtrl.viewTournament);
router.get('/tournaments/:id/players', tCtrl.getTournamentPlayers);
router.get('/tournaments/:id/games', tCtrl.getTournamentGames);
router.get('/tournaments/:id/standings', tCtrl.getTournamentStandings);

// Player actions (require authentication)
router.post('/tournaments/:id/join', tCtrl.joinTournament);
router.post('/tournaments/:id/leave', tCtrl.leaveTournament);

// ----- Admin-only routes -----
//router.use(requireAuth, requireRole('admin'));
router.post('/admin/tournaments', tCtrl.createTournament);
router.patch('/admin/tournaments/:id', tCtrl.updateTournament);
router.delete('/admin/tournaments/:id', tCtrl.deleteTournament);
router.post('/admin/tournaments/:id/start', tCtrl.startTournament);
router.post('/admin/tournaments/:id/end', tCtrl.endTournament);
router.post('/admin/tournaments/:id/participants', tCtrl.adminAddPlayer);         // body: { userId }
router.delete('/admin/tournaments/:id/participants', tCtrl.adminRemovePlayer);    // body: { userId }

module.exports = router;
