const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const tCtrl = require('../controllers/tournamentController');

// ----- Public / Player route -----
router.get('/tournaments', tCtrl.listTournaments);
router.get('/tournaments/:id', tCtrl.viewTournament);
router.get('/tournaments/:id/players', tCtrl.getTournamentPlayers);
router.get('/tournaments/:id/games', tCtrl.getTournamentGames);
router.get('/tournaments/:id/standings', tCtrl.getTournamentStandings);

// Player actions (require authentication)
router.post('/tournaments/:id/join', requireAuth, tCtrl.joinTournament);
router.post('/tournaments/:id/leave', requireAuth, tCtrl.leaveTournament);

// ----- Admin-only routes -----
router.post('/admin/tournaments/create', requireAuth, requireRole('admin'), tCtrl.createTournament);
router.patch('/admin/tournaments/:id/update', requireAuth, requireRole('admin'), tCtrl.updateTournament);
router.delete('/admin/tournaments/:id/delete', requireAuth, requireRole('admin'), tCtrl.deleteTournament);
router.post('/admin/tournaments/:id/start', requireAuth, requireRole('admin'), tCtrl.startTournament);
router.post('/admin/tournaments/:id/end', requireAuth, requireRole('admin'), tCtrl.endTournament);

// Admin participant management
router.post('/admin/tournaments/:id/participants/add', requireAuth, requireRole('admin'), tCtrl.adminAddPlayer);
router.delete('/admin/tournaments/:id/participants/remove', requireAuth, requireRole('admin'), tCtrl.adminRemovePlayer);
router.post('/admin/tournaments/:id/participants/pause', requireAuth, requireRole('admin'), tCtrl.pausePlayer);
router.post('/admin/tournaments/:id/participants/resume', requireAuth, requireRole('admin'), tCtrl.resumePlayer);
router.post('/admin/tournaments/:id/participants/import-csv', requireAuth, requireRole('admin'), tCtrl.importPlayersFromCSV);

module.exports = router;
