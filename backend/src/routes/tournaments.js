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

// Player actions (will require player authentication)
router.post('/tournaments/:id/join', tCtrl.joinTournament);
router.post('/tournaments/:id/leave', tCtrl.leaveTournament);

// ----- Admin-only routes -----
//router.use(requireAuth, requireRole('admin'));
router.post('/admin/tournaments/create', tCtrl.createTournament);
router.patch('/admin/tournaments/:id/update', tCtrl.updateTournament);
router.delete('/admin/tournaments/:id/delete', tCtrl.deleteTournament);
router.post('/admin/tournaments/:id/start', tCtrl.startTournament);
router.post('/admin/tournaments/:id/end', tCtrl.endTournament);

// Will require admin authentication
router.post('/admin/tournaments/:id/participants/add', tCtrl.adminAddPlayer);         // body: { userId }
router.delete('/admin/tournaments/:id/participants/remove', tCtrl.adminRemovePlayer);    // body: { userId }
router.post('/admin/tournaments/:id/participants/pause', tCtrl.pausePlayer);             // body: { userId }
router.post('/admin/tournaments/:id/participants/resume', tCtrl.resumePlayer);           // body: { userId }

module.exports = router;
