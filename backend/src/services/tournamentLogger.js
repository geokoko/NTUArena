const TournamentLog = require('../models/TournamentLog');

function actorFromUser(user) {
	if (!user) return null;
	return {
		userId: user.publicId || user.id || (user._id ? String(user._id) : null),
		username: user.username || null,
	};
}

function logEvent(tournamentId, eventType, { message = '', payload = null, actor = null, roundNumber = null } = {}) {
	if (!tournamentId || !eventType) return Promise.resolve();

	return TournamentLog.create({
		tournamentId,
		eventType,
		message,
		payload,
		actor: actorFromUser(actor),
		roundNumber,
	}).catch((err) => {
		if (process.env.NODE_ENV !== 'test') {
			console.error('[TournamentLogger] failed to write log:', err.message);
		}
	});
}

module.exports = {
	logEvent,
	actorFromUser,
};
