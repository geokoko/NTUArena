// routes/userRoutes.js
const express = require('express');
const router = express.Router();
//const { requireAuth, requireRole } = require('../middleware/auth');
const userCtrl = require('../controllers/userController');

// Player self-registration route
router.post('/users/register', userCtrl.register);

// ---- Admin-only management routes ----
//router.use(requireAuth, requireRole('admin'));
router.get('/admin/users', userCtrl.listUsers);
router.get('/admin/users/:id', userCtrl.getUser);
router.post('/admin/users', userCtrl.createUser);
router.patch('/admin/users/:id', userCtrl.updateUser);
router.delete('/admin/users/:id', userCtrl.deleteUser);
router.patch('/admin/users/:id/update_elo', userCtrl.updateUserElo);

module.exports = router;

