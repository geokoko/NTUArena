// routes/tournamentRoutes.js
const express = require('express');
const router = express.Router();
//const { requireAuth, requireRole } = require('../middleware/auth');
const tCtrl = require('../controllers/tournamentController');

// ----- Public / Player route -----
router.get('/tournaments/:id', tCtrl.viewTournament);

// Player actions (require authentication)
router.post('/tournaments/:id/join', requireAuth, tCtrl.joinTournament);
router.post('/tournaments/:id/leave', requireAuth, tCtrl.leaveTournament);

// ----- Admin-only routes -----
//router.use(requireAuth, requireRole('admin'));
router.post('/admin/tournaments', tCtrl.createTournament);
router.delete('/admin/tournaments/:id', tCtrl.deleteTournament);
router.post('/admin/tournaments/:id/start', tCtrl.startTournament);
router.post('/admin/tournaments/:id/end', tCtrl.endTournament);
router.post('/admin/tournaments/:id/participants', tCtrl.adminAddPlayer);         // body: { userId }
router.delete('/admin/tournaments/:id/participants', tCtrl.adminRemovePlayer);    // body: { userId }

module.exports = router;

