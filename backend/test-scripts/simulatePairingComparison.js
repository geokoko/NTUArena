const fs = require('fs');
const path = require('path');

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
const {
	selectGreedyBatchPairings,
	selectGraphBatchPairings,
} = require('../src/services/pairing/selectBatchPairings');

const DEFAULTS = {
	players: 20,
	seed: 20260519,
	durationMinutes: 60,
	outputDir: path.join(__dirname, '..', 'test-output'),
};

function parseArgs(argv) {
	const opts = { ...DEFAULTS };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg.startsWith('--')) continue;
		const key = arg.slice(2);
		const next = argv[i + 1];
		if (['players', 'seed', 'durationMinutes'].includes(key)) {
			const value = Number(next);
			if (!Number.isFinite(value)) throw new Error(`Invalid numeric value for --${key}: ${next}`);
			opts[key] = value;
			i += 1;
		} else if (key === 'outputDir') {
			opts.outputDir = next;
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

function hashToUnit(...parts) {
	let h = 2166136261;
	for (const part of parts.join('|')) {
		h ^= part.charCodeAt(0);
		h = Math.imul(h, 16777619);
	}
	return (h >>> 0) / 4294967296;
}

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

function asNumber(value, fallback = 0) {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

function minutes(ms) {
	return Math.round(ms / 60000);
}

function roundMinutes(ms) {
	return Number((ms / 60000).toFixed(2));
}

function formatClock(startMs, timestamp) {
	const total = minutes(timestamp - startMs);
	const h = Math.floor(total / 60);
	const m = total % 60;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function calculatePerformanceRating({ sumOpponentRatings = 0, gamesPlayed = 0, score = 0 }) {
	const games = asNumber(gamesPlayed, 0);
	if (!games) return 0;
	const points = asNumber(score, 0);
	let avgOpp = sumOpponentRatings / games;
	if (!Number.isFinite(avgOpp)) avgOpp = 0;

	const effectiveAvgOpp = Math.max(avgOpp, 1400);
	const fraction = points / games;

	if (fraction >= 1) return Math.round(effectiveAvgOpp + 400);
	if (fraction <= 0) return Math.round(Math.max(effectiveAvgOpp - 400, 0));

	const diff = clamp(400 * Math.log10(fraction / (1 - fraction)), -400, 400);
	return Math.round(Math.max(effectiveAvgOpp + diff, 0));
}

function createPlayers(count, seed, startMs) {
	const rng = mulberry32(seed);
	const firstNames = [
		'Alex', 'Maria', 'Nikos', 'Eleni', 'Iris', 'Dimitris', 'Sofia', 'Petros', 'Danae', 'Kostas',
		'Anna', 'Marios', 'Stella', 'Giorgos', 'Mina', 'Theo', 'Lina', 'Aris', 'Chloe', 'Panos',
	];

	return Array.from({ length: count }, (_, index) => {
		const band = index < 4 ? 1750 + rng() * 320 : index < 14 ? 1250 + rng() * 430 : 850 + rng() * 360;
		const rating = Math.round(band);
		return {
			_id: `P${String(index + 1).padStart(2, '0')}`,
			name: firstNames[index % firstNames.length],
			score: 0,
			liveRating: rating,
			entryRating: rating,
			standing: null,
			recentOpponents: [],
			colorHistory: [],
			waitingSince: new Date(startMs),
			status: 'active',
			isPlaying: false,
			gamesPlayed: 0,
			wins: 0,
			draws: 0,
			losses: 0,
			sumOpponentRatings: 0,
			gameHistory: [],
		};
	});
}

function clonePlayers(players) {
	return players.map((player) => ({
		...player,
		recentOpponents: [...player.recentOpponents],
		colorHistory: [...player.colorHistory],
		gameHistory: [...player.gameHistory],
		waitingSince: player.waitingSince ? new Date(player.waitingSince) : null,
	}));
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

function buildLeaveSchedule(players, startMs, durationMs) {
	const planned = [
		{ index: 16, at: 32 },
		{ index: 7, at: 47 },
		{ index: 12, at: 57 },
	];
	return planned
		.filter(({ index, at }) => index < players.length && at * 60000 < durationMs)
		.map(({ index, at }) => ({
			type: 'leave',
			time: startMs + at * 60000,
			playerId: players[index]._id,
			reason: 'early_exit',
		}));
}

function colorFor(player, game) {
	return String(game.whiteId) === String(player._id) ? 'white' : 'black';
}

function rollbackLatestPairingHistory(player, opponentId, expectedColor) {
	const opponents = [...(player.recentOpponents ?? [])];
	const colors = [...(player.colorHistory ?? [])];
	if (!opponents.length || !colors.length) return;
	if (String(opponents.at(-1)) !== String(opponentId) || colors.at(-1) !== expectedColor) return;

	player.recentOpponents = opponents.slice(0, -1);
	player.colorHistory = colors.slice(0, -1);
}

function applyPairing(white, black, now) {
	white.isPlaying = true;
	black.isPlaying = true;
	white.waitingSince = null;
	black.waitingSince = null;
	white.colorHistory = [...white.colorHistory, 'white'].slice(-10);
	black.colorHistory = [...black.colorHistory, 'black'].slice(-10);
	white.recentOpponents = [...white.recentOpponents, black._id].slice(-10);
	black.recentOpponents = [...black.recentOpponents, white._id].slice(-10);
	white.lastPairedAt = new Date(now);
	black.lastPairedAt = new Date(now);
}

function gameDurationMs({ white, black, startMs, seed, gameNumber }) {
	const roll = hashToUnit(seed, 'duration', white._id, black._id, Math.floor(startMs / 60000), gameNumber);
	const jitter = hashToUnit(seed, 'duration-jitter', black._id, white._id, gameNumber);
	const ratingGap = Math.abs((white.liveRating ?? white.entryRating) - (black.liveRating ?? black.entryRating));
	const mismatchShortcut = Math.min(ratingGap / 1200, 0.35);
	let durationMinutes;

	if (roll < 0.08) durationMinutes = 1.8 + jitter * 1.2;
	else if (roll < 0.36) durationMinutes = 3 + jitter * 2.2;
	else if (roll < 0.76) durationMinutes = 5.2 + jitter * 2.6;
	else durationMinutes = 7.8 + jitter * 2.45;

	durationMinutes = clamp(durationMinutes - mismatchShortcut, 1.5, 10.25);
	return Math.round(durationMinutes * 60000);
}

function scoreResult(white, black, seed, gameNumber) {
	const expectedWhite = 1 / (1 + 10 ** ((black.liveRating - white.liveRating) / 400));
	const diff = white.liveRating - black.liveRating;
	const drawProb = clamp(0.16 + 0.24 * Math.exp(-Math.abs(diff) / 250), 0.14, 0.4);
	const decisiveProb = 1 - drawProb;
	const whiteProb = decisiveProb * expectedWhite;
	const roll = hashToUnit(seed, 'result', white._id, black._id, gameNumber);

	if (roll < drawProb) return 'draw';
	if (roll < drawProb + whiteProb) return 'white';
	return 'black';
}

function applyResultToPlayer({ player, opponentRating, resultColor, perspective, gameId, now }) {
	const isWhite = perspective === 'white';
	const resultMap = {
		white: isWhite ? 1 : 0,
		black: isWhite ? 0 : 1,
		draw: 0.5,
	};
	const points = resultMap[resultColor] ?? 0;

	player.isPlaying = false;
	player.gamesPlayed += 1;
	player.score += points;
	player.gameHistory = [...player.gameHistory, gameId].slice(-50);
	player.sumOpponentRatings += opponentRating;
	player.lastResultAt = new Date(now);

	if (resultColor === 'draw') player.draws += 1;
	else if ((resultColor === 'white' && isWhite) || (resultColor === 'black' && !isWhite)) player.wins += 1;
	else player.losses += 1;

	player.liveRating = calculatePerformanceRating({
		sumOpponentRatings: player.sumOpponentRatings,
		gamesPlayed: player.gamesPlayed,
		score: player.score,
	});
}

function headToHeadCount(a, b) {
	const bId = String(b._id);
	return (a.recentOpponents ?? []).filter((opp) => String(opp) === bId).length;
}

function validatePairing(whiteBefore, blackBefore) {
	const priorMeetings = Math.max(headToHeadCount(whiteBefore, blackBefore), headToHeadCount(blackBefore, whiteBefore));
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
		violations: Object.entries(checks)
			.filter(([, passed]) => passed === false)
			.map(([name]) => name),
	};
}

function summarizePlayer(player) {
	return {
		id: player._id,
		name: player.name,
		status: player.status,
		score: Number(player.score.toFixed(1)),
		liveRating: player.liveRating,
		gamesPlayed: player.gamesPlayed,
		wins: player.wins,
		draws: player.draws,
		losses: player.losses,
		colors: player.colorHistory.map((color) => color[0].toUpperCase()).join(''),
	};
}

function simulateAlgorithm({ name, selector, basePlayers, leaveSchedule, seed, startMs, durationMs }) {
	const originalDateNow = Date.now;
	let now = startMs;
	Date.now = () => now;

	try {
		const players = clonePlayers(basePlayers);
		const playersById = new Map(players.map((player) => [player._id, player]));
		let waitingQueue = players.map((player) => player._id);
		let gameCounter = 0;
		const activeGames = new Map();
		const events = leaveSchedule.map((event) => ({ ...event }));
		const timeline = [];
		const cycles = [];
		const waitSamples = [];
		const waitRecords = [];
		const metrics = {
			gamesStarted: 0,
			gamesCompleted: 0,
			gamesCancelled: 0,
			ruleViolations: 0,
			engineWarnings: 0,
			stalledPoolEvents: 0,
			usedFallbackCycles: 0,
		};

		function log(type, message, extra = {}) {
			timeline.push({ time: formatClock(startMs, now), type, message, ...extra });
		}

		function enqueuePlayer(player) {
			if (!player || player.status !== 'active' || player.isPlaying) return;
			if (waitingQueue.includes(player._id)) return;
			if (!player.waitingSince) player.waitingSince = new Date(now);
			waitingQueue.push(player._id);
		}

		function removeFromQueue(playerId) {
			waitingQueue = waitingQueue.filter((id) => String(id) !== String(playerId));
		}

		function scheduleEvent(event) {
			events.push(event);
			events.sort((left, right) => {
				if (left.time !== right.time) return left.time - right.time;
				const order = { finish: 0, leave: 1 };
				return (order[left.type] ?? 9) - (order[right.type] ?? 9);
			});
		}

		function finishGame(gameId) {
			const game = activeGames.get(gameId);
			if (!game || game.status !== 'active') return;

			const white = playersById.get(game.whiteId);
			const black = playersById.get(game.blackId);
			activeGames.delete(gameId);
			game.status = 'finished';

			applyResultToPlayer({
				player: white,
				opponentRating: game.blackStartRating,
				resultColor: game.resultColor,
				perspective: 'white',
				gameId,
				now,
			});
			applyResultToPlayer({
				player: black,
				opponentRating: game.whiteStartRating,
				resultColor: game.resultColor,
				perspective: 'black',
				gameId,
				now,
			});

			metrics.gamesCompleted += 1;
			log('finish', `${gameId}: ${white._id} vs ${black._id} result ${game.resultColor}`);
			enqueuePlayer(white);
			enqueuePlayer(black);
		}

		function pausePlayer(playerId, reason) {
			const player = playersById.get(playerId);
			if (!player || player.status !== 'active') return;

			player.status = 'paused';
			removeFromQueue(playerId);

			const activeGame = [...activeGames.values()].find((game) => (
				game.status === 'active' && (game.whiteId === playerId || game.blackId === playerId)
			));

			if (!activeGame) {
				player.waitingSince = null;
				log('pause', `${playerId} paused while waiting`, { reason });
				return;
			}

			const opponentId = activeGame.whiteId === playerId ? activeGame.blackId : activeGame.whiteId;
			const opponent = playersById.get(opponentId);
			activeGame.status = 'cancelled';
			activeGames.delete(activeGame.id);

			rollbackLatestPairingHistory(player, opponentId, colorFor(player, activeGame));
			rollbackLatestPairingHistory(opponent, playerId, colorFor(opponent, activeGame));

			player.isPlaying = false;
			player.waitingSince = null;
			opponent.isPlaying = false;
			opponent.waitingSince = new Date(now);
			metrics.gamesCancelled += 1;
			log('pause', `${playerId} paused mid-game; cancelled ${activeGame.id} vs ${opponentId}`, { reason });
			enqueuePlayer(opponent);
		}

		function runPairingCycle(label) {
			refreshStandings(players);
			waitingQueue = waitingQueue.filter((id) => {
				const player = playersById.get(id);
				return player && player.status === 'active' && !player.isPlaying;
			});

			const candidates = waitingQueue.map((id) => playersById.get(id));
			if (candidates.length < 2) return;

			const result = selector(candidates, evaluatePair, { maxExactComponentVertices: 24 });
			const used = new Set();
			const pairLog = [];

			for (const { white, black } of result.pairings) {
				const whiteBefore = { ...white, recentOpponents: [...white.recentOpponents], colorHistory: [...white.colorHistory] };
				const blackBefore = { ...black, recentOpponents: [...black.recentOpponents], colorHistory: [...black.colorHistory] };
				const validation = validatePairing(whiteBefore, blackBefore);
				if (validation.violations.length) metrics.ruleViolations += validation.violations.length;
				if (used.has(white._id) || used.has(black._id)) metrics.engineWarnings += 1;
				used.add(white._id);
				used.add(black._id);

				const whiteWaitMs = white.waitingSince ? now - new Date(white.waitingSince).getTime() : 0;
				const blackWaitMs = black.waitingSince ? now - new Date(black.waitingSince).getTime() : 0;
				waitSamples.push(whiteWaitMs, blackWaitMs);

				applyPairing(white, black, now);
				gameCounter += 1;
				const gameId = `${name}-G${String(gameCounter).padStart(3, '0')}`;
				const duration = gameDurationMs({ white, black, startMs: now, seed, gameNumber: gameCounter });
				const resultColor = scoreResult(white, black, seed, gameCounter);
				const game = {
					id: gameId,
					status: 'active',
					whiteId: white._id,
					blackId: black._id,
					whiteStartRating: white.liveRating,
					blackStartRating: black.liveRating,
					startTime: now,
					finishTime: now + duration,
					resultColor,
				};
				activeGames.set(gameId, game);
				scheduleEvent({ type: 'finish', time: game.finishTime, gameId });
				metrics.gamesStarted += 1;
				waitRecords.push(
					{ playerId: white._id, gameId, waitMinutes: roundMinutes(whiteWaitMs), pairedAt: formatClock(startMs, now) },
					{ playerId: black._id, gameId, waitMinutes: roundMinutes(blackWaitMs), pairedAt: formatClock(startMs, now) },
				);

				pairLog.push({
					gameId,
					whiteId: white._id,
					blackId: black._id,
					durationMinutes: roundMinutes(duration),
					resultColor,
					priorMeetings: validation.priorMeetings,
					violations: validation.violations,
				});
			}

			waitingQueue = result.leftovers.map((player) => player._id);
			const cycle = {
				time: formatClock(startMs, now),
				label,
				queueSize: candidates.length,
				pairingsCreated: result.pairings.length,
				leftovers: result.leftovers.map((player) => player._id),
				legalEdgeCount: result.legalEdgeCount,
				totalPairingScore: Number((result.totalPairingScore ?? 0).toFixed(3)),
				exhaustedNoLegalPairPool: result.exhaustedNoLegalPairPool,
				usedFallback: result.usedFallback,
				pairings: pairLog,
			};
			cycles.push(cycle);

			if (result.exhaustedNoLegalPairPool) metrics.stalledPoolEvents += 1;
			if (result.usedFallback) metrics.usedFallbackCycles += 1;
			log('pair', `${cycle.pairingsCreated} games from ${cycle.queueSize} waiting players`, {
				leftovers: cycle.leftovers,
				usedFallback: result.usedFallback,
			});
		}

		refreshStandings(players);
		runPairingCycle('initial');

		while (events.length) {
			const nextTime = events[0].time;
			if (nextTime > startMs + durationMs) break;
			now = nextTime;

			const simultaneous = [];
			while (events.length && events[0].time === nextTime) simultaneous.push(events.shift());

			for (const event of simultaneous.filter((item) => item.type === 'finish')) {
				finishGame(event.gameId);
			}
			for (const event of simultaneous.filter((item) => item.type === 'leave')) {
				pausePlayer(event.playerId, event.reason);
			}

			runPairingCycle(`after ${simultaneous.map((event) => event.type).join('+')}`);
		}

		refreshStandings(players);
		const avgWaitMinutes = waitSamples.length
			? waitSamples.reduce((sum, value) => sum + value, 0) / waitSamples.length / 60000
			: 0;
		const maxWaitMinutes = waitSamples.length
			? Math.max(...waitSamples) / 60000
			: 0;
		const activeWaitingAtEnd = waitingQueue
			.map((id) => playersById.get(id))
			.filter((player) => player?.status === 'active' && player.waitingSince)
			.map((player) => ({
				playerId: player._id,
				waitMinutes: roundMinutes(startMs + durationMs - new Date(player.waitingSince).getTime()),
			}))
			.sort((left, right) => right.waitMinutes - left.waitMinutes);

		return {
			name,
			metrics: {
				...metrics,
				avgWaitMinutes: Number(avgWaitMinutes.toFixed(2)),
				maxWaitMinutes: Number(maxWaitMinutes.toFixed(2)),
				waitsOver5Minutes: waitRecords.filter((record) => record.waitMinutes > 5).length,
				waitsOver8Minutes: waitRecords.filter((record) => record.waitMinutes > 8).length,
				playersStillWaiting: waitingQueue.length,
				activeGamesAtEnd: activeGames.size,
			},
			cycles,
			timeline,
			longestWaits: [...waitRecords]
				.sort((left, right) => right.waitMinutes - left.waitMinutes)
				.slice(0, 12),
			activeWaitingAtEnd,
			finalStandings: refreshStandings(players).map(summarizePlayer),
		};
	} finally {
		Date.now = originalDateNow;
	}
}

function escapeHtml(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

function bar(width, value, max) {
	const actual = max > 0 ? Math.max(2, Math.round((value / max) * width)) : 0;
	return `<svg viewBox="0 0 ${width} 12" width="${width}" height="12" role="img"><rect x="0" y="1" width="${actual}" height="10" rx="2"></rect></svg>`;
}

function renderHtml(report) {
	const rows = report.results.map((result) => {
		const m = result.metrics;
		return `<tr>
			<td>${escapeHtml(result.name)}</td>
			<td>${m.gamesStarted}</td>
			<td>${m.gamesCompleted}</td>
			<td>${m.gamesCancelled}</td>
			<td>${m.stalledPoolEvents}</td>
			<td>${m.ruleViolations}</td>
			<td>${m.engineWarnings}</td>
			<td>${m.avgWaitMinutes}</td>
			<td>${m.maxWaitMinutes}</td>
			<td>${m.waitsOver5Minutes}</td>
			<td>${m.waitsOver8Minutes}</td>
		</tr>`;
	}).join('');

	const maxStarted = Math.max(...report.results.map((result) => result.metrics.gamesStarted), 1);
	const bars = report.results.map((result) => `<div class="bar-row">
		<strong>${escapeHtml(result.name)}</strong>
		${bar(320, result.metrics.gamesStarted, maxStarted)}
		<span>${result.metrics.gamesStarted} games started</span>
	</div>`).join('');

	const cycleTables = report.results.map((result) => {
		const cycleRows = result.cycles.map((cycle) => `<tr>
			<td>${cycle.time}</td>
			<td>${cycle.queueSize}</td>
			<td>${cycle.legalEdgeCount ?? ''}</td>
			<td>${cycle.pairingsCreated}</td>
			<td>${escapeHtml(cycle.leftovers.join(', '))}</td>
			<td>${cycle.exhaustedNoLegalPairPool ? 'yes' : 'no'}</td>
			<td>${cycle.usedFallback ? 'yes' : 'no'}</td>
		</tr>`).join('');
		return `<section>
			<h2>${escapeHtml(result.name)} cycles</h2>
			<table>
				<thead><tr><th>Time</th><th>Waiting</th><th>Legal edges</th><th>Games</th><th>Leftovers</th><th>Stalled</th><th>Fallback</th></tr></thead>
				<tbody>${cycleRows}</tbody>
			</table>
		</section>`;
	}).join('');

	const standings = report.results.map((result) => {
		const rows = result.finalStandings.map((player, index) => `<tr>
			<td>${index + 1}</td>
			<td>${escapeHtml(player.id)}</td>
			<td>${escapeHtml(player.name)}</td>
			<td>${player.status}</td>
			<td>${player.score}</td>
			<td>${player.liveRating}</td>
			<td>${player.gamesPlayed}</td>
			<td>${escapeHtml(player.colors)}</td>
		</tr>`).join('');
		return `<section>
			<h2>${escapeHtml(result.name)} final standings</h2>
			<table>
				<thead><tr><th>#</th><th>ID</th><th>Name</th><th>Status</th><th>Score</th><th>Live rating</th><th>Games</th><th>Colors</th></tr></thead>
				<tbody>${rows}</tbody>
			</table>
		</section>`;
	}).join('');

	const waitTables = report.results.map((result) => {
		const rows = result.longestWaits.map((record) => `<tr>
			<td>${escapeHtml(record.playerId)}</td>
			<td>${escapeHtml(record.gameId)}</td>
			<td>${record.waitMinutes}</td>
			<td>${escapeHtml(record.pairedAt)}</td>
		</tr>`).join('');
		const endRows = result.activeWaitingAtEnd.map((record) => `<tr>
			<td>${escapeHtml(record.playerId)}</td>
			<td>${record.waitMinutes}</td>
		</tr>`).join('');
		return `<section>
			<h2>${escapeHtml(result.name)} longest waits</h2>
			<table>
				<thead><tr><th>Player</th><th>Game</th><th>Wait minutes</th><th>Paired at</th></tr></thead>
				<tbody>${rows}</tbody>
			</table>
			${endRows ? `<h2>${escapeHtml(result.name)} waiting at time control</h2><table><thead><tr><th>Player</th><th>Wait minutes</th></tr></thead><tbody>${endRows}</tbody></table>` : ''}
		</section>`;
	}).join('');

	const eventRows = report.results.map((result) => {
		const rows = result.timeline.slice(0, 160).map((event) => `<tr>
			<td>${event.time}</td>
			<td>${escapeHtml(result.name)}</td>
			<td>${escapeHtml(event.type)}</td>
			<td>${escapeHtml(event.message)}</td>
		</tr>`).join('');
		return rows;
	}).join('');

	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<title>Pairing Algorithm Comparison</title>
	<style>
		body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17211b; background: #f5f7f3; }
		main { max-width: 1180px; margin: 0 auto; padding: 32px 20px 56px; }
		h1 { margin: 0 0 8px; font-size: 30px; }
		h2 { margin: 32px 0 12px; font-size: 20px; }
		p { margin: 0 0 20px; color: #526055; }
		table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #dfe5dc; }
		th, td { padding: 8px 10px; border-bottom: 1px solid #e8ede5; text-align: left; font-size: 13px; vertical-align: top; }
		th { background: #eef3ea; color: #334138; font-weight: 700; }
		.bar-row { display: grid; grid-template-columns: 110px 330px 1fr; gap: 12px; align-items: center; margin: 10px 0; }
		svg rect { fill: #49725b; }
		.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px; }
		.panel { background: #fff; border: 1px solid #dfe5dc; padding: 16px; }
		code { background: #e9eee6; padding: 2px 5px; }
	</style>
</head>
<body>
	<main>
		<h1>Pairing Algorithm Comparison</h1>
		<p>Scenario: ${report.scenario.players} players, ${report.scenario.durationMinutes} minutes, ${escapeHtml(report.scenario.timeControl)}, varied game durations capped near 10 minutes, fixed leave schedule, asynchronous game finishes, seed <code>${report.scenario.seed}</code>.</p>
		<section class="grid">
			<div class="panel">
				<h2>Summary</h2>
				<table>
					<thead><tr><th>Algorithm</th><th>Started</th><th>Completed</th><th>Cancelled</th><th>Stalled</th><th>Rule violations</th><th>Warnings</th><th>Avg wait</th><th>Max wait</th><th>&gt;5m</th><th>&gt;8m</th></tr></thead>
					<tbody>${rows}</tbody>
				</table>
			</div>
			<div class="panel">
				<h2>Games Started</h2>
				${bars}
			</div>
		</section>
		${cycleTables}
		${waitTables}
		${standings}
		<section>
			<h2>Timeline Sample</h2>
			<table>
				<thead><tr><th>Time</th><th>Algorithm</th><th>Event</th><th>Detail</th></tr></thead>
				<tbody>${eventRows}</tbody>
			</table>
		</section>
	</main>
</body>
</html>`;
}

function runComparison(options) {
	const startMs = Date.UTC(2026, 4, 19, 17, 30, 0);
	const durationMs = options.durationMinutes * 60000;
	const basePlayers = createPlayers(options.players, options.seed, startMs);
	const leaveSchedule = buildLeaveSchedule(basePlayers, startMs, durationMs);
	const scenario = {
		players: options.players,
		seed: options.seed,
		durationMinutes: options.durationMinutes,
		timeControl: '3+2 blitz',
		gameDurationModel: {
			minMinutes: 1.5,
			maxMinutes: 10.25,
			description: 'Piecewise deterministic random distribution with short games, a middle mass around 5-8 minutes, and a long tail near the 3+2 maximum.',
		},
		rules: {
			maxColorStreak: MAX_COLOR_STREAK,
			maxColorImbalance: MAX_COLOR_IMBALANCE,
			maxMeetings: 2,
		},
		leaveSchedule: leaveSchedule.map((event) => ({
			time: formatClock(startMs, event.time),
			playerId: event.playerId,
			reason: event.reason,
		})),
	};

	const results = [
		simulateAlgorithm({
			name: 'greedy-current',
			selector: selectGreedyBatchPairings,
			basePlayers,
			leaveSchedule,
			seed: options.seed,
			startMs,
			durationMs,
		}),
		simulateAlgorithm({
			name: 'graph-matching',
			selector: selectGraphBatchPairings,
			basePlayers,
			leaveSchedule,
			seed: options.seed,
			startMs,
			durationMs,
		}),
	];

	return { scenario, results };
}

function writeOutputs(report, outputDir) {
	fs.mkdirSync(outputDir, { recursive: true });
	const prefix = `pairing-comparison-${report.scenario.players}p-${report.scenario.durationMinutes}m`;
	const jsonPath = path.join(outputDir, `${prefix}.json`);
	const htmlPath = path.join(outputDir, `${prefix}.html`);
	fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
	fs.writeFileSync(htmlPath, renderHtml(report));
	return { jsonPath, htmlPath };
}

try {
	const options = parseArgs(process.argv.slice(2));
	const report = runComparison(options);
	const outputs = writeOutputs(report, options.outputDir);

	console.log('Pairing comparison simulation');
	console.log(`players=${options.players} durationMinutes=${options.durationMinutes} seed=${options.seed}`);
	for (const result of report.results) {
		console.log(
			`${result.name}: started=${result.metrics.gamesStarted} completed=${result.metrics.gamesCompleted} `
			+ `cancelled=${result.metrics.gamesCancelled} stalled=${result.metrics.stalledPoolEvents} `
			+ `violations=${result.metrics.ruleViolations} warnings=${result.metrics.engineWarnings} `
			+ `avgWaitMinutes=${result.metrics.avgWaitMinutes} maxWaitMinutes=${result.metrics.maxWaitMinutes} `
			+ `waitsOver5=${result.metrics.waitsOver5Minutes} waitsOver8=${result.metrics.waitsOver8Minutes}`
		);
	}
	console.log(`json=${outputs.jsonPath}`);
	console.log(`html=${outputs.htmlPath}`);
	process.exit(report.results.every((result) => result.metrics.ruleViolations === 0 && result.metrics.engineWarnings === 0) ? 0 : 1);
} catch (error) {
	console.error(error.stack || error.message);
	process.exit(1);
}
