const fs = require('fs');
const path = require('path');

const { runComparison } = require('./simulatePairingComparison');

const DEFAULTS = {
	players: [12, 20, 32, 48, 80],
	settleSeconds: [0, 10, 20, 30, 45, 60, 90],
	seedStart: 20260519,
	seedCount: 8,
	durationMinutes: 60,
	outputDir: path.join(__dirname, '..', 'test-output'),
};

const PALETTE = [
	'#326273',
	'#4f7f52',
	'#b66d12',
	'#8c4f2d',
	'#5f5aa2',
	'#ab3e5b',
	'#2f7f7f',
	'#79613f',
];

const SCREENING_RULES = {
	throughputLossRatio: 0.15,
	longWaitsOver5PerRun: 0.5,
	longWaitsOver8PerRun: 0,
	avgWaitMinutes: 2.5,
	thinPoolMinimum: 4,
	thinPoolPlayerRatio: 0.08,
	thinPoolMaximum: 6,
};

function parseNumberList(value, flagName) {
	const parsed = String(value)
		.split(',')
		.map((part) => Number(part.trim()))
		.filter((value) => Number.isFinite(value));

	if (!parsed.length) throw new Error(`Invalid --${flagName}: ${value}`);
	return parsed;
}

function parseArgs(argv) {
	const opts = { ...DEFAULTS };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg.startsWith('--')) continue;

		const key = arg.slice(2);
		const next = argv[i + 1];
		if (key === 'players') {
			opts.players = parseNumberList(next, key);
			i += 1;
		} else if (key === 'settleSeconds') {
			opts.settleSeconds = parseNumberList(next, key);
			i += 1;
		} else if (['seedStart', 'seedCount', 'durationMinutes'].includes(key)) {
			const value = Number(next);
			if (!Number.isFinite(value)) throw new Error(`Invalid numeric value for --${key}: ${next}`);
			opts[key] = value;
			i += 1;
		} else if (key === 'outputDir') {
			opts.outputDir = next;
			i += 1;
		}
	}

	opts.players = [...new Set(opts.players)].sort((a, b) => a - b);
	opts.settleSeconds = [...new Set(opts.settleSeconds)].sort((a, b) => a - b);
	opts.seedCount = Math.max(1, Math.round(opts.seedCount));
	return opts;
}

function round(value, digits = 2) {
	return Number(value.toFixed(digits));
}

function escapeHtml(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

function csvValue(value) {
	if (value === null || value === undefined) return '';
	const text = String(value);
	return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function sumPairingScore(cycles) {
	return cycles.reduce((sum, cycle) => sum + (Number(cycle.totalPairingScore) || 0), 0);
}

function runSweep(options) {
	const seeds = Array.from({ length: options.seedCount }, (_, index) => options.seedStart + index);
	const rawRows = [];
	const groups = new Map();

	for (const playerCount of options.players) {
		for (const settleSeconds of options.settleSeconds) {
			for (const seed of seeds) {
				const report = runComparison({
					players: playerCount,
					durationMinutes: options.durationMinutes,
					settleSeconds,
					seed,
				});

				for (const result of report.results) {
					const m = result.metrics;
					const totalPairingScore = sumPairingScore(result.cycles);
					const row = {
						players: playerCount,
						settleSeconds,
						seed,
						algorithm: result.name,
						gamesStarted: m.gamesStarted,
						gamesCompleted: m.gamesCompleted,
						gamesCancelled: m.gamesCancelled,
						stalledPoolEvents: m.stalledPoolEvents,
						ruleViolations: m.ruleViolations,
						engineWarnings: m.engineWarnings,
						avgWaitMinutes: m.avgWaitMinutes,
						maxWaitMinutes: m.maxWaitMinutes,
						waitsOver5Minutes: m.waitsOver5Minutes,
						waitsOver8Minutes: m.waitsOver8Minutes,
						avgPairingPoolSize: m.avgPairingPoolSize,
						maxPairingPoolSize: m.maxPairingPoolSize,
						cyclesWithPoolAtLeast6: m.cyclesWithPoolAtLeast6,
						cyclesWithPoolAtLeast10: m.cyclesWithPoolAtLeast10,
						avgPairingScore: m.gamesStarted ? totalPairingScore / m.gamesStarted : 0,
					};
					rawRows.push(row);

					const key = `${playerCount}|${settleSeconds}|${result.name}`;
					if (!groups.has(key)) {
						groups.set(key, {
							players: playerCount,
							settleSeconds,
							algorithm: result.name,
							runs: 0,
							gamesStarted: 0,
							gamesCompleted: 0,
							gamesCancelled: 0,
							stalledPoolEvents: 0,
							ruleViolations: 0,
							engineWarnings: 0,
							avgWaitMinutes: 0,
							maxWaitMinutes: 0,
							waitsOver5Minutes: 0,
							waitsOver8Minutes: 0,
							avgPairingPoolSize: 0,
							maxPairingPoolSize: 0,
							cyclesWithPoolAtLeast6: 0,
							cyclesWithPoolAtLeast10: 0,
							avgPairingScore: 0,
							worstMaxWaitMinutes: 0,
						});
					}

					const group = groups.get(key);
					group.runs += 1;
					group.gamesStarted += row.gamesStarted;
					group.gamesCompleted += row.gamesCompleted;
					group.gamesCancelled += row.gamesCancelled;
					group.stalledPoolEvents += row.stalledPoolEvents;
					group.ruleViolations += row.ruleViolations;
					group.engineWarnings += row.engineWarnings;
					group.avgWaitMinutes += row.avgWaitMinutes;
					group.maxWaitMinutes += row.maxWaitMinutes;
					group.waitsOver5Minutes += row.waitsOver5Minutes;
					group.waitsOver8Minutes += row.waitsOver8Minutes;
					group.avgPairingPoolSize += row.avgPairingPoolSize;
					group.maxPairingPoolSize = Math.max(group.maxPairingPoolSize, row.maxPairingPoolSize);
					group.cyclesWithPoolAtLeast6 += row.cyclesWithPoolAtLeast6;
					group.cyclesWithPoolAtLeast10 += row.cyclesWithPoolAtLeast10;
					group.avgPairingScore += row.avgPairingScore;
					group.worstMaxWaitMinutes = Math.max(group.worstMaxWaitMinutes, row.maxWaitMinutes);
				}
			}
		}
	}

	const aggregates = [...groups.values()].map((group) => ({
		players: group.players,
		settleSeconds: group.settleSeconds,
		algorithm: group.algorithm,
		runs: group.runs,
		avgGamesStarted: round(group.gamesStarted / group.runs),
		avgGamesCompleted: round(group.gamesCompleted / group.runs),
		avgGamesCancelled: round(group.gamesCancelled / group.runs),
		avgStalledPoolEvents: round(group.stalledPoolEvents / group.runs),
		totalRuleViolations: group.ruleViolations,
		totalEngineWarnings: group.engineWarnings,
		avgWaitMinutes: round(group.avgWaitMinutes / group.runs),
		avgMaxWaitMinutes: round(group.maxWaitMinutes / group.runs),
		worstMaxWaitMinutes: round(group.worstMaxWaitMinutes),
		waitsOver5PerRun: round(group.waitsOver5Minutes / group.runs),
		waitsOver8PerRun: round(group.waitsOver8Minutes / group.runs),
		avgPairingPoolSize: round(group.avgPairingPoolSize / group.runs),
		maxPairingPoolSize: group.maxPairingPoolSize,
		avgCyclesWithPoolAtLeast6: round(group.cyclesWithPoolAtLeast6 / group.runs),
		avgCyclesWithPoolAtLeast10: round(group.cyclesWithPoolAtLeast10 / group.runs),
		avgPairingScore: round(group.avgPairingScore / group.runs, 3),
		isValid: group.ruleViolations === 0 && group.engineWarnings === 0,
		isPareto: false,
		isPareto2d: false,
		isProblematic: false,
		throughputRatio: 1,
		screeningReasons: [],
	}));

	markParetoFrontiers(aggregates);
	markProblematicConfigurations(aggregates);
	const screenedOut = aggregates.filter((item) => item.isProblematic);

	return {
		scenario: {
			players: options.players,
			settleSeconds: options.settleSeconds,
			seeds,
			seedStart: options.seedStart,
			seedCount: options.seedCount,
			durationMinutes: options.durationMinutes,
			timeControl: '3+2 blitz',
			paretoObjectives: [
				'maximize avg games started',
				'maximize average pairing pool size',
				'minimize average wait',
				'minimize waits over 5 minutes',
			],
			screeningRules: {
				tooFewGames: `avg games started is more than ${Math.round(SCREENING_RULES.throughputLossRatio * 100)}% below the best value for the same player count and algorithm`,
				longWaits: `waits over 8 minutes occur, waits over 5 minutes average at least ${SCREENING_RULES.longWaitsOver5PerRun} per run, or average wait is at least ${SCREENING_RULES.avgWaitMinutes} minutes`,
				thinQueue: `average pool size is below max(${SCREENING_RULES.thinPoolMinimum}, min(${SCREENING_RULES.thinPoolMaximum}, players * ${SCREENING_RULES.thinPoolPlayerRatio}))`,
			},
		},
		screenedOut,
		aggregates,
		rawRows,
	};
}

function dominates(a, b) {
	return a.isValid
		&& a.avgGamesStarted >= b.avgGamesStarted
		&& a.avgPairingPoolSize >= b.avgPairingPoolSize
		&& a.avgWaitMinutes <= b.avgWaitMinutes
		&& a.waitsOver5PerRun <= b.waitsOver5PerRun
		&& (
			a.avgGamesStarted > b.avgGamesStarted
			|| a.avgPairingPoolSize > b.avgPairingPoolSize
			|| a.avgWaitMinutes < b.avgWaitMinutes
			|| a.waitsOver5PerRun < b.waitsOver5PerRun
		);
}

function dominates2d(a, b) {
	return a.isValid
		&& a.avgGamesStarted >= b.avgGamesStarted
		&& a.avgWaitMinutes <= b.avgWaitMinutes
		&& (a.avgGamesStarted > b.avgGamesStarted || a.avgWaitMinutes < b.avgWaitMinutes);
}

function markParetoFrontiers(aggregates) {
	const groups = new Map();
	for (const item of aggregates) {
		const key = `${item.players}|${item.algorithm}`;
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(item);
	}

	for (const points of groups.values()) {
		for (const point of points) {
			point.isPareto = point.isValid && !points.some((candidate) => candidate !== point && dominates(candidate, point));
			point.isPareto2d = point.isValid && !points.some((candidate) => candidate !== point && dominates2d(candidate, point));
		}
	}
}

function thinPoolThreshold(players) {
	return Math.max(
		SCREENING_RULES.thinPoolMinimum,
		Math.min(SCREENING_RULES.thinPoolMaximum, players * SCREENING_RULES.thinPoolPlayerRatio),
	);
}

function markProblematicConfigurations(aggregates) {
	const groups = new Map();
	for (const item of aggregates) {
		const key = `${item.players}|${item.algorithm}`;
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(item);
	}

	for (const points of groups.values()) {
		const maxStarted = Math.max(...points.map((point) => point.avgGamesStarted));
		for (const point of points) {
			const reasons = [];
			const poolFloor = thinPoolThreshold(point.players);
			point.throughputRatio = maxStarted > 0 ? round(point.avgGamesStarted / maxStarted, 3) : 0;
			point.thinPoolThreshold = round(poolFloor, 2);

			if (!point.isValid) {
				reasons.push('rules/warnings');
			}
			if (point.throughputRatio < 1 - SCREENING_RULES.throughputLossRatio) {
				reasons.push(`too few games (${Math.round(point.throughputRatio * 100)}% of best)`);
			}
			if (
				point.waitsOver8PerRun > SCREENING_RULES.longWaitsOver8PerRun
				|| point.waitsOver5PerRun >= SCREENING_RULES.longWaitsOver5PerRun
				|| point.avgWaitMinutes >= SCREENING_RULES.avgWaitMinutes
			) {
				reasons.push('long waits');
			}
			if (point.avgPairingPoolSize < poolFloor) {
				reasons.push(`thin queue (<${round(poolFloor, 1)} avg pool)`);
			}

			point.screeningReasons = reasons;
			point.isProblematic = reasons.length > 0;
		}
	}
}

function renderPlot(points, playerCount) {
	const graphPoints = points
		.filter((point) => point.players === playerCount && point.algorithm === 'graph-matching')
		.sort((left, right) => left.settleSeconds - right.settleSeconds);
	const width = 760;
	const height = 360;
	const pad = { left: 62, right: 28, top: 28, bottom: 54 };
	const plotWidth = width - pad.left - pad.right;
	const plotHeight = height - pad.top - pad.bottom;
	const xMax = Math.max(...graphPoints.map((point) => point.avgWaitMinutes), 1) * 1.12;
	const yMinRaw = Math.min(...graphPoints.map((point) => point.avgGamesStarted));
	const yMaxRaw = Math.max(...graphPoints.map((point) => point.avgGamesStarted));
	const yMin = Math.max(0, yMinRaw - Math.max(2, (yMaxRaw - yMinRaw) * 0.18));
	const yMax = yMaxRaw + Math.max(2, (yMaxRaw - yMinRaw) * 0.18);
	const poolMin = Math.min(...graphPoints.map((point) => point.avgPairingPoolSize));
	const poolMax = Math.max(...graphPoints.map((point) => point.avgPairingPoolSize));
	const colorBySettle = new Map(graphPoints.map((point, index) => [point.settleSeconds, PALETTE[index % PALETTE.length]]));

	const x = (value) => pad.left + (value / xMax) * plotWidth;
	const y = (value) => pad.top + (1 - ((value - yMin) / (yMax - yMin))) * plotHeight;
	const r = (point) => {
		if (poolMax === poolMin) return 7;
		return 5 + ((point.avgPairingPoolSize - poolMin) / (poolMax - poolMin)) * 8;
	};

	const yTicks = Array.from({ length: 5 }, (_, index) => yMin + ((yMax - yMin) * index) / 4);
	const xTicks = Array.from({ length: 5 }, (_, index) => (xMax * index) / 4);
	const frontier = graphPoints.filter((point) => point.isPareto2d).sort((left, right) => left.avgWaitMinutes - right.avgWaitMinutes);
	const frontierPath = frontier.map((point) => `${x(point.avgWaitMinutes)},${y(point.avgGamesStarted)}`).join(' ');

	const grid = [
		...yTicks.map((tick) => `<line x1="${pad.left}" y1="${y(tick)}" x2="${width - pad.right}" y2="${y(tick)}" class="grid-line"></line><text x="${pad.left - 10}" y="${y(tick) + 4}" text-anchor="end">${round(tick, 1)}</text>`),
		...xTicks.map((tick) => `<line x1="${x(tick)}" y1="${pad.top}" x2="${x(tick)}" y2="${height - pad.bottom}" class="grid-line"></line><text x="${x(tick)}" y="${height - pad.bottom + 24}" text-anchor="middle">${round(tick, 1)}</text>`),
	].join('');

	const markers = graphPoints.map((point) => {
		const px = x(point.avgWaitMinutes);
		const py = y(point.avgGamesStarted);
		const classes = [
			point.isPareto ? 'pareto' : '',
			point.isProblematic ? 'problematic' : '',
		].filter(Boolean).join(' ');
		return `<g class="${classes}">
			<circle cx="${px}" cy="${py}" r="${round(r(point), 1)}" fill="${colorBySettle.get(point.settleSeconds)}"></circle>
			<text x="${px}" y="${py - 12}" text-anchor="middle">${point.settleSeconds}s</text>
			<title>${point.settleSeconds}s: ${point.avgGamesStarted} games, ${point.avgWaitMinutes}m avg wait, avg pool ${point.avgPairingPoolSize}${point.isProblematic ? `, flagged: ${point.screeningReasons.join('; ')}` : ''}</title>
		</g>`;
	}).join('');

	const legend = graphPoints.map((point, index) => {
		const xPos = pad.left + index * 86;
		const yPos = height - 14;
		return `<g><circle cx="${xPos}" cy="${yPos}" r="5" fill="${colorBySettle.get(point.settleSeconds)}"></circle><text x="${xPos + 10}" y="${yPos + 4}">${point.settleSeconds}s</text></g>`;
	}).join('');

	return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Pareto plot for ${playerCount} players">
		<rect x="0" y="0" width="${width}" height="${height}" class="plot-bg"></rect>
		${grid}
		<line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="axis"></line>
		<line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" class="axis"></line>
		${frontierPath ? `<polyline points="${frontierPath}" class="frontier-line"></polyline>` : ''}
		${markers}
		<text x="${width / 2}" y="${height - 24}" text-anchor="middle" class="axis-label">Average wait before pairing, minutes (lower is better)</text>
		<text transform="translate(18 ${height / 2}) rotate(-90)" text-anchor="middle" class="axis-label">Games started per hour (higher is better)</text>
		<text x="${pad.left}" y="18" class="chart-title">${playerCount} players, graph matching</text>
		<text x="${width - pad.right}" y="18" text-anchor="end" class="chart-note">Circle size = average pool size</text>
		${legend}
	</svg>`;
}

function renderHtml(report) {
	const screenedRows = report.screenedOut
		.filter((item) => item.algorithm === 'graph-matching')
		.sort((left, right) => left.players - right.players || left.settleSeconds - right.settleSeconds)
		.map((item) => `<tr>
		<td>${item.players}</td>
		<td>${item.settleSeconds}s</td>
		<td>${item.avgGamesStarted}</td>
		<td>${Math.round(item.throughputRatio * 100)}%</td>
		<td>${item.avgWaitMinutes}</td>
		<td>${item.waitsOver5PerRun}</td>
		<td>${item.avgPairingPoolSize}</td>
		<td>${escapeHtml(item.screeningReasons.join(', '))}</td>
	</tr>`).join('');

	const screeningRuleRows = Object.entries(report.scenario.screeningRules).map(([name, description]) => `<tr>
		<td>${escapeHtml(name)}</td>
		<td>${escapeHtml(description)}</td>
	</tr>`).join('');

	const frontierRows = report.aggregates
		.filter((item) => item.algorithm === 'graph-matching' && item.isPareto && !item.isProblematic)
		.sort((left, right) => left.players - right.players || left.settleSeconds - right.settleSeconds)
		.map((item) => `<tr>
		<td>${item.players}</td>
		<td>${item.settleSeconds}s</td>
		<td>${item.avgGamesStarted}</td>
		<td>${Math.round(item.throughputRatio * 100)}%</td>
		<td>${item.avgWaitMinutes}</td>
		<td>${item.waitsOver5PerRun}</td>
		<td>${item.avgPairingPoolSize}</td>
		<td>${item.avgStalledPoolEvents}</td>
	</tr>`).join('');

	const chartSections = report.scenario.players.map((playerCount) => `<section class="panel chart-panel">
		${renderPlot(report.aggregates, playerCount)}
	</section>`).join('');

	const aggregateRows = report.aggregates
		.sort((left, right) => (
			left.players - right.players
			|| left.algorithm.localeCompare(right.algorithm)
			|| left.settleSeconds - right.settleSeconds
		))
		.map((item) => `<tr class="${item.isProblematic ? 'problematic-row' : ''}">
			<td>${item.players}</td>
			<td>${escapeHtml(item.algorithm)}</td>
			<td>${item.settleSeconds}s</td>
			<td>${item.avgGamesStarted}</td>
			<td>${item.avgGamesCompleted}</td>
			<td>${Math.round(item.throughputRatio * 100)}%</td>
			<td>${item.avgWaitMinutes}</td>
			<td>${item.avgMaxWaitMinutes}</td>
			<td>${item.waitsOver5PerRun}</td>
			<td>${item.avgPairingPoolSize}</td>
			<td>${item.avgStalledPoolEvents}</td>
			<td>${item.avgPairingScore}</td>
			<td>${item.isPareto ? 'yes' : 'no'}</td>
			<td>${item.isProblematic ? 'yes' : ''}</td>
			<td>${escapeHtml(item.screeningReasons.join(', '))}</td>
			<td>${item.totalRuleViolations}</td>
			<td>${item.totalEngineWarnings}</td>
		</tr>`).join('');

	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<title>Pairing Pareto Sweep</title>
	<style>
		body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17211b; background: #f3f5ee; }
		main { max-width: 1240px; margin: 0 auto; padding: 32px 20px 56px; }
		h1 { margin: 0 0 8px; font-size: 32px; }
		h2 { margin: 32px 0 12px; font-size: 21px; }
		p { color: #4f5d52; line-height: 1.45; }
		table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #d9e0d2; }
		th, td { padding: 8px 9px; border-bottom: 1px solid #e7ece2; text-align: left; font-size: 13px; }
		th { background: #e9efdf; color: #2d3c2f; }
		.panel { background: #fff; border: 1px solid #d9e0d2; padding: 16px; margin-bottom: 18px; box-shadow: 0 12px 26px rgba(53, 67, 42, 0.06); }
		.chart-panel { overflow-x: auto; }
		.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 18px; }
		.problematic-row { background: #fff2ee; }
		code { background: #e9eee2; padding: 2px 5px; }
		svg { width: 100%; min-width: 720px; height: auto; }
		svg text { font-size: 12px; fill: #334138; }
		.plot-bg { fill: #fbfcf8; }
		.grid-line { stroke: #dfe5d8; stroke-width: 1; }
		.axis { stroke: #3b493e; stroke-width: 1.4; }
		.axis-label, .chart-note { fill: #5a685d; }
		.chart-title { font-weight: 700; font-size: 15px; }
		.frontier-line { fill: none; stroke: #101811; stroke-width: 2.2; stroke-dasharray: 5 4; }
		circle { opacity: 0.84; stroke: #fff; stroke-width: 1.2; }
		.pareto circle { stroke: #101811; stroke-width: 2.2; opacity: 0.95; }
		.problematic circle { stroke: #c92727; stroke-width: 3; opacity: 0.72; }
	</style>
</head>
<body>
	<main>
		<h1>Pairing Settle Window Pareto Sweep</h1>
		<p>Scenario: ${report.scenario.players.join(', ')} players, ${report.scenario.durationMinutes}-minute 3+2 arena, settle windows ${report.scenario.settleSeconds.join(', ')} seconds, ${report.scenario.seedCount} deterministic seeds starting at <code>${report.scenario.seedStart}</code>. The frontier is nondominated under the selected metrics; this report does not choose a winner. Red outlines/rows mark configurations screened as problematic because of long waits, low throughput, or a thin queue.</p>

		<section class="panel">
			<h2>Screening Rules</h2>
			<table>
				<thead><tr><th>Flag</th><th>Rule</th></tr></thead>
				<tbody>${screeningRuleRows}</tbody>
			</table>
		</section>

		<section class="panel">
			<h2>Problematic Graph-Matching Configurations</h2>
			<table>
				<thead><tr><th>Players</th><th>Settle</th><th>Avg games</th><th>Throughput</th><th>Avg wait</th><th>&gt;5m/run</th><th>Avg pool</th><th>Reasons</th></tr></thead>
				<tbody>${screenedRows}</tbody>
			</table>
		</section>

		<section class="panel">
			<h2>Non-Problematic Graph-Matching Pareto Points</h2>
			<table>
				<thead><tr><th>Players</th><th>Settle</th><th>Avg games</th><th>Throughput</th><th>Avg wait</th><th>&gt;5m/run</th><th>Avg pool</th><th>Stalls/run</th></tr></thead>
				<tbody>${frontierRows}</tbody>
			</table>
		</section>

		<h2>Pareto Plots</h2>
		<div class="grid">${chartSections}</div>

		<section class="panel">
			<h2>Aggregate Data</h2>
			<table>
				<thead><tr><th>Players</th><th>Algorithm</th><th>Settle</th><th>Started</th><th>Completed</th><th>Throughput</th><th>Avg wait</th><th>Avg max wait</th><th>&gt;5m/run</th><th>Avg pool</th><th>Stalls</th><th>Pair score</th><th>Pareto</th><th>Problem</th><th>Reasons</th><th>Violations</th><th>Warnings</th></tr></thead>
				<tbody>${aggregateRows}</tbody>
			</table>
		</section>
	</main>
</body>
</html>`;
}

function writeOutputs(report, outputDir) {
	fs.mkdirSync(outputDir, { recursive: true });
	const playerPart = `${Math.min(...report.scenario.players)}-${Math.max(...report.scenario.players)}p`;
	const prefix = `pairing-pareto-${playerPart}-${report.scenario.durationMinutes}m-${report.scenario.seedCount}seeds`;
	const jsonPath = path.join(outputDir, `${prefix}.json`);
	const csvPath = path.join(outputDir, `${prefix}.csv`);
	const htmlPath = path.join(outputDir, `${prefix}.html`);

	const csvColumns = [
		'players',
		'algorithm',
		'settleSeconds',
		'runs',
		'avgGamesStarted',
		'avgGamesCompleted',
		'avgWaitMinutes',
		'avgMaxWaitMinutes',
		'worstMaxWaitMinutes',
		'waitsOver5PerRun',
		'waitsOver8PerRun',
		'avgPairingPoolSize',
		'maxPairingPoolSize',
		'avgStalledPoolEvents',
		'avgPairingScore',
		'throughputRatio',
		'isPareto',
		'isProblematic',
		'screeningReasons',
		'totalRuleViolations',
		'totalEngineWarnings',
	];
	const csvRows = [
		csvColumns.join(','),
		...report.aggregates.map((row) => csvColumns.map((column) => csvValue(row[column])).join(',')),
	].join('\n');

	fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
	fs.writeFileSync(csvPath, `${csvRows}\n`);
	fs.writeFileSync(htmlPath, renderHtml(report));
	return { jsonPath, csvPath, htmlPath };
}

function runCli() {
	try {
		const options = parseArgs(process.argv.slice(2));
		const report = runSweep(options);
		const outputs = writeOutputs(report, options.outputDir);

		console.log('Pairing Pareto sweep');
		console.log(`players=${options.players.join(',')} settleSeconds=${options.settleSeconds.join(',')} durationMinutes=${options.durationMinutes} seeds=${options.seedStart}..${options.seedStart + options.seedCount - 1}`);
		for (const playerCount of options.players) {
			const flagged = report.screenedOut
				.filter((item) => item.players === playerCount && item.algorithm === 'graph-matching')
				.sort((left, right) => left.settleSeconds - right.settleSeconds);
			const details = flagged.length
				? flagged.map((item) => `${item.settleSeconds}s(${item.screeningReasons.join('; ')})`).join(', ')
				: 'none';
			console.log(`players=${playerCount}: problematic graph configs=${details}`);
		}
		console.log(`json=${outputs.jsonPath}`);
		console.log(`csv=${outputs.csvPath}`);
		console.log(`html=${outputs.htmlPath}`);
	} catch (error) {
		console.error(error.stack || error.message);
		process.exit(1);
	}
}

if (require.main === module) {
	runCli();
}

module.exports = {
	DEFAULTS,
	parseArgs,
	runSweep,
	writeOutputs,
	renderHtml,
};
