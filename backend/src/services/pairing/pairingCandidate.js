// Fields the pairing scorer and matcher read from a waiting player.
const PAIRING_CANDIDATE_FIELDS = '_id user tempName score entryRating performanceRating recentOpponents lastCancelledOpponent colorHistory status waitingSince';

const toPairingCandidate = (player) => ({
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
});

module.exports = {
	PAIRING_CANDIDATE_FIELDS,
	toPairingCandidate,
};
