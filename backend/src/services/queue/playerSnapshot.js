module.exports = (player, { enqueuedAt = Date.now() } = {}) => ({
	_id: String(player._id),
	user: player.user || null,
	tempName: player.tempName || null,
	score: player.score ?? 0,
	entryRating: player.entryRating ?? 0,
	performanceRating: player.performanceRating ?? null,
	recentOpponents: (player.recentOpponents ?? []).map(String),
	lastCancelledOpponent: player.lastCancelledOpponent ? String(player.lastCancelledOpponent) : null,
	colorHistory: player.colorHistory ?? [],
	status: player.status,
	waitingSince: player.waitingSince ?? null,
	enqueuedAt,
});
