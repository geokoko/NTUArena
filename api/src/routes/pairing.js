const express = require('express');
const router = express.Router();
const controller = require('../controllers/pairingController');

router.get('/generate/:tournamentId', controller.generate.bind(controller));

module.exports = router;

