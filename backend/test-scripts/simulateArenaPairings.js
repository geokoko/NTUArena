const {
	evaluatePair,
	justPlayedTogether,
	lastColorVsOpponent,
	tooManyHeadToHead,
	wouldExceedColorLimit,
	wouldExceedImbalanceLimit,
	MAX_COLOR_STREAK,
	MAX_COLOR_IMBALANCE,
} = require('../src/services/pairing/pairingScorer');
const { selectBatchPairings } = require('../src/services/pairing/selectBatchPairings');

const DEFAULTS = {
	players: 8,
	rounds: 10,
	seed: 20260419,
	roundDurationMs: 180000,
	topStandings: 5,
};

function parseArgs(argv) {
	const opts = { ...DEFAULTS };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg.startsWith('--')) continue;
		const key = arg.slice(2);
		const next = argv[i + 1];
		if (['players', 'rounds', 'seed', 'roundDurationMs', 'topStandings'].includes(key)) {
			const value = Number(next);
			if (!Number.isFinite(value)) {
				throw new Error(`Invalid numeric value for --${key}: ${next}`);
			}
			opts[key] = value;
			i += 1;
		}
	}
	return opts;
}

function mulberry32(seed) {
	let t = seed >>> 0;
	return function rng() {
		t += 0x6D2B79F5;
		let x = Math.imul(t ^ (t >>> 15), t | 1);
		x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
		return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
	};
}

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

function asNumber(value, fallback = 0) {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

function calculatePerformanceRating({ sumOpponentRatings = 0, gamesPlayed = 0, score = 0 }) {
	const games = asNumber(gamesPlayed, 0);
	if (!games) return 0;
	const points = asNumber(score, 0);

	let avgOpp = sumOpponentRatings / games;
	if (!Number.isFinite(avgOpp)) avgOpp = 0;

	const ratingFloor = 1400;
	const effectiveAvgOpp = Math.max(avgOpp, ratingFloor);
	const fraction = points / games;

	if (fraction >= 1) return Math.round(effectiveAvgOpp + 400);
	if (fraction <= 0) return Math.round(Math.max(effectiveAvgOpp - 400, 0));

	const diff = clamp(400 * Math.log10(fraction / (1 - fraction)), -400, 400);
	const performance = effectiveAvgOpp + diff;
	if (!Number.isFinite(performance)) return Math.round(effectiveAvgOpp);
	return Math.round(Math.max(performance, 0));
}

function headToHeadCount(a, b) {
	const bId = String(b._id);
	return (a.recentOpponents ?? []).filter((opp) => String(opp) === bId).length;
}

function summarizeMeetings(a, b) {
	return Math.max(headToHeadCount(a, b), headToHeadCount(b, a));
}

function createPlayers(count, rng, simNow) {
	const players = [];
	for (let i = 0; i < count; i++) {
		const rating = clamp(Math.round(900 + rng() * 700), 800, 2400);
		players.push({
			_id: `P${String(i + 1).padStart(2, '0')}`,
			name: `Player ${String(i + 1).padStart(2, '0')}`,
			score: 0,
			liveRating: rating,
			entryRating: rating,
			standing: null,
			recentOpponents: [],
			colorHistory: [],
			waitingSince: new Date(simNow - i * 1000),
			status: 'active',
			isPlaying: false,
			gamesPlayed: 0,
			wins: 0,
			draws: 0,
			losses: 0,
			sumOpponentRatings: 0,
			gameHistory: [],
		});
	}
	return players;
}

function clonePlayer(player) {
	return {
		...player,
		recentOpponents: [...(player.recentOpponents ?? [])],
		colorHistory: [...(player.colorHistory ?? [])],
		gameHistory: [...(player.gameHistory ?? [])],
		waitingSince: player.waitingSince ? new Date(player.waitingSince) : null,
	};
}

function refreshStandings(players) {
	const sorted = [...players].sort((left, right) => {
		if (right.score !== left.score) return right.score - left.score;
		if (right.liveRating !== left.liveRating) return right.liveRating - left.liveRating;
		return left._id.localeCompare(right._id);
	});
	sorted.forEach((player, index) => {
		player.standing = index + 1;
	});
	return sorted;
}

function formatPlayer(player) {
	return `${player.name}[${player._id}] ${player.score.toFixed(1)}pts LR${player.liveRating}`;
}

function formatColorHistory(player) {
	if (!player.colorHistory.length) return '-';
	return player.colorHistory.map((color) => color[0].toUpperCase()).join('');
}

function scoreResult(white, black, rng) {
	const diff = white.liveRating - black.liveRating;
	const expectedWhite = 1 / (1 + 10 ** ((black.liveRating - white.liveRating) / 400));
	const drawProb = clamp(0.18 + 0.22 * Math.exp(-Math.abs(diff) / 250), 0.15, 0.4);
	const decisiveProb = 1 - drawProb;
	const whiteProb = decisiveProb * expectedWhite;
	const roll = rng();
	if (roll < drawProb) return 'draw';
	if (roll < drawProb + whiteProb) return 'white';
	return 'black';
}

function applyPairing(white, black) {
	white.isPlaying = true;
	black.isPlaying = true;

	white.colorHistory = [...(white.colorHistory ?? []), 'white'].slice(-10);
	black.colorHistory = [...(black.colorHistory ?? []), 'black'].slice(-10);

	white.recentOpponents = [...(white.recentOpponents ?? []), black._id].slice(-10);
	black.recentOpponents = [...(black.recentOpponents ?? []), white._id].slice(-10);

	white.waitingSince = null;
	black.waitingSince = null;
}

function applyResultToPlayer({ player, opponentRating, resultColor, perspective, gameId, simNow }) {
	const isWhite = perspective === 'white';
	const resultMap = {
		white: isWhite ? 1 : 0,
		black: isWhite ? 0 : 1,
		draw: 0.5,
	};
	const points = resultMap[resultColor] ?? 0;

	player.isPlaying = false;
	player.gamesPlayed = asNumber(player.gamesPlayed) + 1;
	player.score = asNumber(player.score) + points;
	player.gameHistory = [...(player.gameHistory ?? []), gameId].slice(-50);
	player.sumOpponentRatings = asNumber(player.sumOpponentRatings) + opponentRating;
	player.lastResultAt = new Date(simNow);

	if (resultColor === 'draw') {
		player.draws = asNumber(player.draws) + 1;
	} else if ((resultColor === 'white' && isWhite) || (resultColor === 'black' && !isWhite)) {
		player.wins = asNumber(player.wins) + 1;
	} else {
		player.losses = asNumber(player.losses) + 1;
	}

	player.liveRating = calculatePerformanceRating({
		sumOpponentRatings: player.sumOpponentRatings,
		gamesPlayed: player.gamesPlayed,
		score: player.score,
	});
}

function validatePairing(whiteBefore, blackBefore) {
	const priorMeetings = summarizeMeetings(whiteBefore, blackBefore);
	const lastWhiteColorVsBlack = lastColorVsOpponent(whiteBefore, blackBefore);
	const checks = {
		noImmediateRematch: !justPlayedTogether(whiteBefore, blackBefore),
		maxMeetings: !tooManyHeadToHead(whiteBefore, blackBefore),
		rematchColorSwap: lastWhiteColorVsBlack === null ? null : lastWhiteColorVsBlack !== 'white',
		whiteStreakLimit: !wouldExceedColorLimit(whiteBefore, 'white'),
		blackStreakLimit: !wouldExceedColorLimit(blackBefore, 'black'),
		whiteImbalanceLimit: !wouldExceedImbalanceLimit(whiteBefore, 'white'),
		blackImbalanceLimit: !wouldExceedImbalanceLimit(blackBefore, 'black'),
	};

	return {
		priorMeetings,
		lastWhiteColorVsBlack,
		checks,
		violations: Object.entries(checks)
			.filter(([, passed]) => passed === false)
			.map(([name]) => name),
	};
}

function formatCheck(name, value) {
	if (value === null) return `${name}=N/A`;
	return `${name}=${value ? 'PASS' : 'FAIL'}`;
}

function findAnyValidPair(players) {
	for (let i = 0; i < players.length; i++) {
		for (let j = i + 1; j < players.length; j++) {
			const evaluation = evaluatePair(players[i], players[j]);
			if (evaluation.ok) {
				return {
					a: players[i],
					b: players[j],
					evaluation,
				};
			}
		}
	}
	return null;
}

function pairRound(queue, playersById) {
	const remaining = queue
		.map((id) => playersById.get(id))
		.filter((player) => player && player.status === 'active' && !player.isPlaying);

	const result = selectBatchPairings(remaining, evaluatePair);
	const pairings = result.pairings.map(({ white, black }) => {
		const evaluation = evaluatePair(white, black);
		return {
			score: evaluation.ok ? evaluation.score : null,
			whiteId: white._id,
			blackId: black._id,
		};
	});

	return {
		pairings,
		leftovers: result.leftovers,
		exhaustedNoLegalPairPool: result.exhaustedNoLegalPairPool,
	};
}

function printStandings(players, topN) {
	const sorted = refreshStandings(players);
	console.log(`  Standings top ${topN}:`);
	sorted.slice(0, topN).forEach((player) => {
		console.log(
			`    #${String(player.standing).padStart(2, ' ')} ${player.name} `
			+ `${player.score.toFixed(1)}pts LR${player.liveRating} `
			+ `colors=${formatColorHistory(player)}`
		);
	});
}

function simulateTournament(options) {
	const rng = mulberry32(options.seed);
	let simNow = Date.UTC(2026, 3, 19, 12, 0, 0);
	const originalDateNow = Date.now;
	Date.now = () => simNow;

	try {
		const players = createPlayers(options.players, rng, simNow);
		refreshStandings(players);
		const playersById = new Map(players.map((player) => [player._id, player]));
		let waitingQueue = players.map((player) => player._id);
		let totalViolations = 0;
		let engineWarnings = 0;
		let stalledPoolEvents = 0;
		let totalPairings = 0;

		console.log('Arena pairing simulation');
		console.log(`players=${options.players} rounds=${options.rounds} seed=${options.seed}`);
		console.log(
			`rules: no immediate rematch, max 2 meetings total, rematch color swap, `
			+ `max streak ${MAX_COLOR_STREAK}, max color imbalance ${MAX_COLOR_IMBALANCE}`
		);
		console.log('');

		for (let round = 1; round <= options.rounds; round++) {
			refreshStandings(players);
			console.log(`Round ${round}`);
			console.log(
				`  Waiting queue: ${waitingQueue
					.map((id) => {
						const player = playersById.get(id);
						return `${player._id}(${player.score.toFixed(1)}/LR${player.liveRating})`;
					})
					.join(', ')}`
			);

			const roundPairing = pairRound(waitingQueue, playersById);
			const usedIds = new Set();
			const roundRequeue = [];
			let board = 1;

			for (const pairing of roundPairing.pairings) {
				const white = playersById.get(pairing.whiteId);
				const black = playersById.get(pairing.blackId);
				const whiteBefore = clonePlayer(white);
				const blackBefore = clonePlayer(black);
				const validation = validatePairing(whiteBefore, blackBefore);

				usedIds.add(white._id);
				usedIds.add(black._id);
				totalViolations += validation.violations.length;
				totalPairings += 1;

				applyPairing(white, black);

				const result = scoreResult(white, black, rng);
				const gameId = `R${round}-B${board}`;
				const whiteOpponentRating = black.liveRating;
				const blackOpponentRating = white.liveRating;

				applyResultToPlayer({
					player: white,
					opponentRating: whiteOpponentRating,
					resultColor: result,
					perspective: 'white',
					gameId,
					simNow,
				});
				applyResultToPlayer({
					player: black,
					opponentRating: blackOpponentRating,
					resultColor: result,
					perspective: 'black',
					gameId,
					simNow,
				});

				white.waitingSince = new Date(simNow);
				black.waitingSince = new Date(simNow);
				roundRequeue.push(white._id, black._id);

				console.log(
					`  Board ${board}: ${formatPlayer(whiteBefore)} as White vs `
					+ `${formatPlayer(blackBefore)} as Black -> result ${result}`
				);
				console.log(
					`    checks: ${[
						formatCheck('immediate_rematch', validation.checks.noImmediateRematch),
						formatCheck('max_meetings', validation.checks.maxMeetings),
						formatCheck('rematch_color_swap', validation.checks.rematchColorSwap),
						formatCheck('white_streak', validation.checks.whiteStreakLimit),
						formatCheck('black_streak', validation.checks.blackStreakLimit),
						formatCheck('white_imbalance', validation.checks.whiteImbalanceLimit),
						formatCheck('black_imbalance', validation.checks.blackImbalanceLimit),
					].join(', ')}`
				);
				console.log(
					`    context: prior_meetings=${validation.priorMeetings}, `
					+ `last_white_color_vs_black=${validation.lastWhiteColorVsBlack ?? 'none'}, `
					+ `pair_score=${pairing.score.toFixed(3)}`
				);
				if (validation.violations.length) {
					console.log(`    violations: ${validation.violations.join(', ')}`);
				}

				board += 1;
			}

			const duplicatePairing = usedIds.size !== roundPairing.pairings.length * 2;
			if (duplicatePairing) {
				engineWarnings += 1;
				console.log('  WARNING: duplicate player assignment detected inside one round.');
			}

			const leftovers = roundPairing.leftovers.map((player) => player._id);
			if (leftovers.length) {
				console.log(
					`  Unpaired: ${leftovers
						.map((id) => formatPlayer(playersById.get(id)))
						.join(', ')}`
				);
			}

			const validLeftoverPair = findAnyValidPair(roundPairing.leftovers);
			if (validLeftoverPair) {
				engineWarnings += 1;
				console.log(
					`  WARNING: a legal pairing remained unused in leftovers: `
					+ `${validLeftoverPair.a.name} vs ${validLeftoverPair.b.name}.`
				);
			}
			if (roundPairing.exhaustedNoLegalPairPool && !validLeftoverPair) {
				stalledPoolEvents += 1;
				console.log(
					`  NOTICE: no legal pairing remained for a pool of ${roundPairing.leftovers.length}; `
					+ `the worker will requeue these players until the pool changes.`
				);
			}

			waitingQueue = leftovers.concat(roundRequeue);
			printStandings(players, options.topStandings);
			console.log('');
			simNow += options.roundDurationMs;
		}

		console.log('Simulation summary');
		console.log(`  total_pairings=${totalPairings}`);
		console.log(`  rule_violations=${totalViolations}`);
		console.log(`  engine_warnings=${engineWarnings}`);
		console.log(`  stalled_pool_events=${stalledPoolEvents}`);

		return {
			totalPairings,
			totalViolations,
			engineWarnings,
			stalledPoolEvents,
		};
	} finally {
		Date.now = originalDateNow;
	}
}

try {
	const options = parseArgs(process.argv.slice(2));
	const result = simulateTournament(options);
	process.exit(result.totalViolations === 0 && result.engineWarnings === 0 ? 0 : 1);
} catch (error) {
	console.error(error.message);
	process.exit(1);
}
