const MAX_COLOR_STREAK    = 3; // Hard-block if a player would exceed this many consecutive same-color games
const MAX_COLOR_IMBALANCE = 3; // Hard-block if |whitesPlayed - blacksPlayed| would exceed this

/**
 * Player snapshot shape we expect in the queue:
 * {
 *   _id: string,
 *   user: string,
 *   score: number,             // tournament score so far
 *   liveRating: number,        // tournament live rating
 *   entryRating: number,       // rating at tournament start
 *   standing: number,          // lower = better rank
 *   recentOpponents: string[], // last K opponent player IDs (most recent at end of array)
 *   colorHistory: string[],    // last N colors played ('white'/'black', most recent at end)
 *   enqueuedAt: number
 * }
 */

function justPlayedTogether(a, b) {
	const bId = String(b._id);
	const aId = String(a._id);
	// recentOpponents are appended at the end, so index 0 is the oldest opponent
	// and the last index is the most recent. Check the last entry of each player.
	const aLastOpp = a.recentOpponents?.at(-1);
	const bLastOpp = b.recentOpponents?.at(-1);
	return String(aLastOpp) === bId || String(bLastOpp) === aId;
}

/**
 * Returns the color player `a` played in their most recent game against player `b`,
 * or null if they have not played together within the recorded history.
 *
 * colorHistory and recentOpponents are appended in sync in createGameFromPairing,
 * so colorHistory[i] is the color played in the game against recentOpponents[i].
 */
function lastColorVsOpponent(a, b) {
	const bId = String(b._id);
	const opponents = a.recentOpponents ?? [];
	const colors = a.colorHistory ?? [];
	// Scan from the end so we get the most recent meeting first.
	for (let i = opponents.length - 1; i >= 0; i--) {
		if (String(opponents[i]) === bId) {
			return colors[i] ?? null;
		}
	}
	return null;
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

/**
 * Returns the overall color imbalance for a player: whites - blacks.
 * Positive = played more whites, negative = played more blacks.
 */
function colorImbalance(colorHistory) {
	if (!colorHistory || colorHistory.length === 0) return 0;
	let whites = 0;
	for (const c of colorHistory) {
		if (c === 'white') whites++;
	}
	return whites - (colorHistory.length - whites); // whites - blacks
}

/**
 * Streak-based hard block: would assigning this color create a run of
 * MAX_COLOR_STREAK or more consecutive same-color games?
 */
function wouldExceedColorLimit(player, assignColor, maxStreak = MAX_COLOR_STREAK) {
	if (!player) return false;
	const streak = colorTailStreak(player.colorHistory, assignColor);
	return streak >= maxStreak;
}

/**
 * Imbalance-based hard block: would assigning this color push the player's
 * overall |whites - blacks| beyond MAX_COLOR_IMBALANCE?
 */
function wouldExceedImbalanceLimit(player, assignColor, maxImbalance = MAX_COLOR_IMBALANCE) {
	if (!player) return false;
	const imb = colorImbalance(player.colorHistory);
	const delta = assignColor === 'white' ? 1 : -1;
	return Math.abs(imb + delta) > maxImbalance;
}

/**
 * Streak-based soft penalty: penalises extending a same-color tail streak.
 * Returns a value in [0, maxPenalty].
 */
function colorPenalty(player, assignColor, maxPenalty = 3) {
	const streak = colorTailStreak(player.colorHistory, assignColor);
	// No penalty for 0–1 streak; then grow smoothly up to maxPenalty
	if (streak <= 1) return 0;
	return Math.min(streak - 1, maxPenalty); // 0..maxPenalty
}

/**
 * Imbalance-based soft penalty: penalises worsening the overall color imbalance.
 * Returns a value in [0, maxPenalty], using the same scale as colorPenalty so
 * they can be combined directly.
 */
function colorImbalancePenalty(player, assignColor, maxPenalty = 3) {
	const imb = colorImbalance(player.colorHistory);
	const delta = assignColor === 'white' ? 1 : -1;
	const newImb = Math.abs(imb + delta);
	// No penalty if the resulting imbalance is 0 or 1 (perfectly balanced or one off)
	if (newImb <= 1) return 0;
	return Math.min(newImb - 1, maxPenalty); // 0..maxPenalty
}

/**
 * Proximity score: a similarity measure between two players, based on their
 * score, rating, and standing. Higher means more similar.
 * Each component is normalized to [0,1] and combined via a weighted average.
 */
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

/**
 * Wait time bonus: contributes a bonus to the total pair score for players who
 * have been waiting longer, to help prioritise them. Uses a smooth tanh curve:
 * at saturationMs the bonus is ~76% of maxBonus (tanh(1) ≈ 0.76), and
 * continues to approach maxBonus asymptotically beyond that point.
 */
function waitTimeBonus(a, b, maxBonus = 0.15, saturationMs = 180000) {
	const now = Date.now();
	const waitA = a.waitingSince ? now - new Date(a.waitingSince).getTime() : 0;
	const waitB = b.waitingSince ? now - new Date(b.waitingSince).getTime() : 0;
	const avgWait = (waitA + waitB) / 2;
	// Smooth curve: approaches maxBonus asymptotically as wait time increases
	return maxBonus * Math.tanh(avgWait / saturationMs);
}

function evaluatePair(a, b, opts = {}) {
	const {
		maxHeadToHead = 2,
		// colorBias scales the combined color penalty (streak + imbalance) against
		// the proximity score when choosing which player gets which color.
		// A higher value enforces stricter color balance at the cost of pairing quality.
		colorWeights = { colorBias: 0.5 },
		proximityWeights = { score: 0.6, elo: 0.4, standing: 0 },
	} = opts;

	if (justPlayedTogether(a, b)) return { ok: false, reason: 'recent_opponents' };
	if (tooManyHeadToHead(a, b, maxHeadToHead)) return { ok: false, reason: 'too_many_meetings' };

	// Rematch color-swap enforcement:
	// If these players have met before, force the opposite color from their last
	// meeting to prevent same-color rematches. This is mandatory — only one color
	// assignment is offered. If that assignment violates a hard constraint (streak or
	// imbalance), the pair is rejected entirely so the worker can try other options.
	const lastColorA = lastColorVsOpponent(a, b);
	if (lastColorA !== null) {
		const requiredColorA = lastColorA === 'white' ? 'black' : 'white';
		const requiredColorB = lastColorA === 'white' ? 'white' : 'black';

		const forcedInvalid =
			wouldExceedColorLimit(a, requiredColorA) || wouldExceedColorLimit(b, requiredColorB) ||
			wouldExceedImbalanceLimit(a, requiredColorA) || wouldExceedImbalanceLimit(b, requiredColorB);

		if (forcedInvalid) {
			return { ok: false, reason: 'color_constraint' };
		}

		// Score the forced assignment with normal soft penalties for fair ranking
		// against other potential pairs the worker is evaluating.
		const pen =
			colorPenalty(a, requiredColorA) + colorImbalancePenalty(a, requiredColorA) +
			colorPenalty(b, requiredColorB) + colorImbalancePenalty(b, requiredColorB);
		const prox = proximityScore(a, b, proximityWeights);
		const waitBonus = waitTimeBonus(a, b);
		const colors = requiredColorA === 'white'
			? { white: a, black: b }
			: { white: b, black: a };

		return { ok: true, score: prox + waitBonus - colorWeights.colorBias * pen, colors };
	}

	// A color assignment is invalid if it would violate EITHER the consecutive-
	// streak limit OR the overall color-imbalance limit for either player.
	const whiteAssignmentInvalid =
		wouldExceedColorLimit(a, 'white') || wouldExceedColorLimit(b, 'black') ||
		wouldExceedImbalanceLimit(a, 'white') || wouldExceedImbalanceLimit(b, 'black');

	const blackAssignmentInvalid =
		wouldExceedColorLimit(a, 'black') || wouldExceedColorLimit(b, 'white') ||
		wouldExceedImbalanceLimit(a, 'black') || wouldExceedImbalanceLimit(b, 'white');

	if (whiteAssignmentInvalid && blackAssignmentInvalid) {
		return { ok: false, reason: 'color_constraint' };
	}

	// Combined soft penalty = streak penalty + imbalance penalty, per player.
	// Both components use the same 0–3 scale so they add naturally.
	const whiteA_pen =
		colorPenalty(a, 'white') + colorImbalancePenalty(a, 'white') +
		colorPenalty(b, 'black') + colorImbalancePenalty(b, 'black');

	const whiteB_pen =
		colorPenalty(a, 'black') + colorImbalancePenalty(a, 'black') +
		colorPenalty(b, 'white') + colorImbalancePenalty(b, 'white');

	const prox = proximityScore(a, b, proximityWeights);
	const waitBonus = waitTimeBonus(a, b);

	const options = [];
	if (!whiteAssignmentInvalid) {
		const scoreAwhite = prox + waitBonus - colorWeights.colorBias * whiteA_pen;
		options.push({ score: scoreAwhite, colors: { white: a, black: b } });
	}
	if (!blackAssignmentInvalid) {
		const scoreBwhite = prox + waitBonus - colorWeights.colorBias * whiteB_pen;
		options.push({ score: scoreBwhite, colors: { white: b, black: a } });
	}

	if (options.length === 0) {
		return { ok: false, reason: 'color_constraint' };
	}

	options.sort((lhs, rhs) => rhs.score - lhs.score);
	return { ok: true, score: options[0].score, colors: options[0].colors };
}

module.exports = {
	evaluatePair,
	// Export helpers for tests
	justPlayedTogether,
	lastColorVsOpponent,
	tooManyHeadToHead,
	colorTailStreak,
	colorImbalance,
	wouldExceedColorLimit,
	wouldExceedImbalanceLimit,
	colorImbalancePenalty,
};

module.exports.MAX_COLOR_STREAK    = MAX_COLOR_STREAK;
module.exports.MAX_COLOR_IMBALANCE = MAX_COLOR_IMBALANCE;
