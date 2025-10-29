const MAX_COLOR_STREAK = 3;

/**
 * Player snapshot shape we expect in the queue:
 * {
 *   _id: string,
 *   user: string,
 *   performanceRating: number, // tournament performance so far
 *   standing: number,          // lower = better rank
 *   globalElo: number,         // global ELO
 *   recentOpponents: string[], // last K opponents (most recent first)
 *   vsCounts: { [playerId]: number }, // times played with each opponent (optional)
 *   colorHistory: { white: number, black: number }, // last N colors count
 *   enqueuedAt: number
 * }
 */

function justPlayedTogether(a, b) {
	if (!a.recentOpponents || !a.recentOpponents.length) return false;
	const bId = String(b._id);
	// recentOpponents are Player ObjectIds; compare stringified
	return String(a.recentOpponents[0]) === bId || String(b.recentOpponents?.[0]) === String(a._id);
}

function headToHeadCount(a, b) {
	const bId = String(b._id);
	let cnt = 0;
	for (const opp of a.recentOpponents ?? []) {
		if (String(opp) === bId) cnt++;
	}
	return cnt;
}

function tooManyHeadToHead(a, b, maxMeetings = 2) {
	const ab = headToHeadCount(a, b);
	const ba = headToHeadCount(b, a);
	return Math.max(ab, ba) >= maxMeetings;
}

function colorTailStreak(history, color) {
	if (!history || history.length === 0) return 0;
	let s = 0;
	for (let i = history.length - 1; i >= 0; i--) {
		if (history[i] === color) s++;
			else break;
	}
	return s;
}

function colorPenalty(player, assignColor, maxPenalty = 3) {
	// Penalize extending a same-color tail streak
	const streak = colorTailStreak(player.colorHistory, assignColor);
	// No penalty for 0–1 streak; then grow smoothly up to maxPenalty
	if (streak <= 1) return 0;
	return Math.min(streak - 1, maxPenalty); // 0..maxPenalty
}

function wouldExceedColorLimit(player, assignColor, maxStreak = MAX_COLOR_STREAK) {
	if (!player) return false;
	const streak = colorTailStreak(player.colorHistory, assignColor);
	return streak >= maxStreak;
}

function proximityScore(a, b, weights = { score: 0.6, elo: 0.4, standing: 0 }) {
	const scoreDiff = Math.abs((a.score ?? 0) - (b.score ?? 0));
	const eloDiff   = Math.abs((a.liveRating ?? 1200) - (b.liveRating ?? 1200));
	const aStanding = a.standing ?? null;
	const bStanding = b.standing ?? null;
	const standingDiff = (aStanding != null && bStanding != null)
		? Math.abs(aStanding - bStanding)
		: 0;

	// normalization in [0,1]
	const scoreSim    = 1 - Math.tanh(scoreDiff / 2);   // score gaps are usually small integers
	const eloSim      = 1 - Math.tanh(eloDiff / 400);   // 0..1 over elo differences
	const standingSim = (standingDiff === 0 && aStanding == null) ? 0
		: 1 - Math.tanh(standingDiff / 8);

	return (
		weights.score    * scoreSim +
			weights.elo      * eloSim +
			weights.standing * standingSim
	);
}

function evaluatePair(a, b, opts = {}) {
	const {
		maxHeadToHead = 2,
		colorWeights = { colorBias: 0.25 },
		proximityWeights = { score: 0.6, elo: 0.4, standing: 0 },
	} = opts;

	if (justPlayedTogether(a, b)) return { ok: false, reason: 'recent_opponents' };
	if (tooManyHeadToHead(a, b, maxHeadToHead)) return { ok: false, reason: 'too_many_meetings' };

	const whiteAssignmentInvalid =
		wouldExceedColorLimit(a, 'white') || wouldExceedColorLimit(b, 'black');
	const blackAssignmentInvalid =
		wouldExceedColorLimit(a, 'black') || wouldExceedColorLimit(b, 'white');

	if (whiteAssignmentInvalid && blackAssignmentInvalid) {
		return { ok: false, reason: 'color_streak' };
	}

	const whiteA_pen = colorPenalty(a, 'white') + colorPenalty(b, 'black');
	const whiteB_pen = colorPenalty(a, 'black') + colorPenalty(b, 'white');

	const prox = proximityScore(a, b, proximityWeights);

	const options = [];
	if (!whiteAssignmentInvalid) {
		const scoreAwhite = prox - colorWeights.colorBias * whiteA_pen;
		options.push({ score: scoreAwhite, colors: { white: a, black: b } });
	}
	if (!blackAssignmentInvalid) {
		const scoreBwhite = prox - colorWeights.colorBias * whiteB_pen;
		options.push({ score: scoreBwhite, colors: { white: b, black: a } });
	}

	if (options.length === 0) {
		return { ok: false, reason: 'color_streak' };
	}

	options.sort((lhs, rhs) => rhs.score - lhs.score);
	return { ok: true, score: options[0].score, colors: options[0].colors };
}

module.exports = {
	evaluatePair,
	// Export helpers for tests
	justPlayedTogether,
	tooManyHeadToHead,
	colorTailStreak,
	wouldExceedColorLimit,
};

module.exports.MAX_COLOR_STREAK = MAX_COLOR_STREAK;
};
