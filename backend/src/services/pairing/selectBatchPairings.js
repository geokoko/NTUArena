const blossom = require('edmonds-blossom-fixed');
const { evaluatePair } = require('./pairingScorer');

const DEFAULT_PAIRING_COST_WEIGHTS = {
	legacyScore: 100,
	headToHead: 250,
	rank: 300,
	rating: 140,
	ratingDeviation: 60,
	berserk: 40,
	wait: 35,
};

function selectGreedyBatchPairings(batch, evaluatePairFn = evaluatePair) {
	const remaining = [...batch];
	const pairings = [];
	let stalledRotations = 0;
	let exhaustedNoLegalPairPool = false;
	let totalPairingScore = 0;

	while (remaining.length >= 2) {
		const anchor = remaining[0];
		let bestIdx = -1;
		let bestEval = null;

		for (let i = 1; i < remaining.length; i++) {
			const evaluation = evaluatePairFn(anchor, remaining[i]);
			if (!evaluation.ok) continue;
			if (!bestEval || evaluation.score > bestEval.score) {
				bestEval = evaluation;
				bestIdx = i;
			}
		}

		if (bestIdx === -1) {
			remaining.push(remaining.shift());
			stalledRotations += 1;
			if (stalledRotations >= remaining.length) {
				exhaustedNoLegalPairPool = true;
				break;
			}
			continue;
		}

		stalledRotations = 0;
		remaining.splice(bestIdx, 1);
		remaining.shift();
		pairings.push(bestEval.colors);
		totalPairingScore += bestEval.score;
	}

	return {
		pairings,
		leftovers: remaining,
		exhaustedNoLegalPairPool,
		strategy: 'greedy',
		usedFallback: false,
		totalPairingScore,
		legalEdgeCount: null,
	};
}

function asFiniteNumber(value, fallback = null) {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

function colorTailStreak(history, color) {
	let streak = 0;
	for (let i = (history ?? []).length - 1; i >= 0; i--) {
		if (history[i] !== color) break;
		streak += 1;
	}
	return streak;
}

function playerRank(player) {
	return asFiniteNumber(player.standing ?? player.rank, null);
}

function playerRating(player) {
	return asFiniteNumber(player.entryRating ?? player.liveRating ?? player.rating, 1200);
}

function playerRatingDeviation(player) {
	return asFiniteNumber(player.ratingDeviation ?? player.rd ?? player.ratingDeviationValue, null);
}

function playerBerserkRate(player) {
	return asFiniteNumber(player.berserkRate ?? player.zerkRate, null);
}

function headToHeadCount(a, b) {
	const bId = String(b._id);
	return (a.recentOpponents ?? []).filter((opponentId) => String(opponentId) === bId).length;
}

function normalizedDiff(left, right, scale) {
	if (left == null || right == null) return 0;
	return Math.tanh(Math.abs(left - right) / scale);
}

function averageWaitMinutes(a, b) {
	const now = Date.now();
	const waitA = a.waitingSince ? Math.max(0, now - new Date(a.waitingSince).getTime()) : 0;
	const waitB = b.waitingSince ? Math.max(0, now - new Date(b.waitingSince).getTime()) : 0;
	return (waitA + waitB) / 2 / 60000;
}

function forcedColorStress(player, color) {
	const opposite = color === 'white' ? 'black' : 'white';
	return colorTailStreak(player.colorHistory, opposite) >= 2 ? 0.2 : 0;
}

function pairingCost(a, b, evaluation, weights = DEFAULT_PAIRING_COST_WEIGHTS) {
	const meetings = Math.max(headToHeadCount(a, b), headToHeadCount(b, a));
	const rankA = playerRank(a);
	const rankB = playerRank(b);
	const rdA = playerRatingDeviation(a);
	const rdB = playerRatingDeviation(b);
	const berserkA = playerBerserkRate(a);
	const berserkB = playerBerserkRate(b);
	const colorStress =
		forcedColorStress(evaluation.colors.white, 'white') +
		forcedColorStress(evaluation.colors.black, 'black');

	return (
		-weights.legacyScore * (evaluation.score + colorStress) +
		weights.headToHead * Math.min(meetings, 2) / 2 +
		weights.rank * normalizedDiff(rankA, rankB, 8) +
		weights.rating * normalizedDiff(playerRating(a), playerRating(b), 400) +
		weights.ratingDeviation * normalizedDiff(rdA, rdB, 80) +
		weights.berserk * normalizedDiff(berserkA, berserkB, 0.35) -
		weights.wait * Math.tanh(averageWaitMinutes(a, b) / 3)
	);
}

function buildPairingGraph(batch, evaluatePairFn = evaluatePair, options = {}) {
	const edges = [];
	const adjacency = Array.from({ length: batch.length }, () => []);
	const costWeights = {
		...DEFAULT_PAIRING_COST_WEIGHTS,
		...(options.costWeights ?? {}),
	};

	for (let i = 0; i < batch.length; i++) {
		for (let j = i + 1; j < batch.length; j++) {
			const evaluation = evaluatePairFn(batch[i], batch[j]);
			if (!evaluation.ok) continue;
			const cost = pairingCost(batch[i], batch[j], evaluation, costWeights);

			const edge = {
				i,
				j,
				score: evaluation.score,
				cost,
				colors: evaluation.colors,
			};
			edges.push(edge);
			adjacency[i].push(edge);
			adjacency[j].push(edge);
		}
	}

	if (edges.length) {
		const maxCost = Math.max(...edges.map((edge) => edge.cost));
		for (const edge of edges) {
			edge.matchWeight = Math.max(1, Math.round((maxCost - edge.cost) * 1000) + 1);
		}
	}

	return { edges, adjacency };
}

function connectedComponents(vertexCount, adjacency) {
	const visited = new Array(vertexCount).fill(false);
	const components = [];

	for (let start = 0; start < vertexCount; start++) {
		if (visited[start]) continue;

		const vertices = [];
		const stack = [start];
		visited[start] = true;

		while (stack.length) {
			const vertex = stack.pop();
			vertices.push(vertex);

			for (const edge of adjacency[vertex]) {
				const next = edge.i === vertex ? edge.j : edge.i;
				if (visited[next]) continue;
				visited[next] = true;
				stack.push(next);
			}
		}

		components.push(vertices.sort((a, b) => a - b));
	}

	return components;
}

function solveBlossomComponent(vertices, adjacency) {
	const localIndex = new Map(vertices.map((vertex, index) => [vertex, index]));
	const localEdges = [];
	const edgeByLocalPair = new Map();

	for (const vertex of vertices) {
		const sourceLocal = localIndex.get(vertex);
		for (const edge of adjacency[vertex]) {
			const other = edge.i === vertex ? edge.j : edge.i;
			if (!localIndex.has(other)) continue;
			const targetLocal = localIndex.get(other);
			if (sourceLocal < targetLocal) {
				localEdges.push([sourceLocal, targetLocal, edge.matchWeight]);
				edgeByLocalPair.set(`${sourceLocal}:${targetLocal}`, edge);
			}
		}
	}

	if (!localEdges.length) return [];

	const mate = blossom(localEdges, true);
	const selected = [];
	for (let local = 0; local < mate.length; local++) {
		const mateLocal = mate[local];
		if (mateLocal == null || mateLocal < 0 || local >= mateLocal) continue;
		const edge = edgeByLocalPair.get(`${local}:${mateLocal}`);
		if (edge) selected.push(edge);
	}

	return selected;
}

function hasLegalLeftoverEdge(leftovers, graphEdges, batch) {
	const leftoverIds = new Set(leftovers.map((player) => String(player._id)));
	return graphEdges.some((edge) => (
		leftoverIds.has(String(batch[edge.i]._id)) &&
		leftoverIds.has(String(batch[edge.j]._id))
	));
}

function selectGraphBatchPairings(batch, evaluatePairFn = evaluatePair, options = {}) {
	const graph = buildPairingGraph(batch, evaluatePairFn, options);
	const components = connectedComponents(batch.length, graph.adjacency);
	const pairings = [];
	const matchedIndexes = new Set();
	let totalPairingScore = 0;
	let totalPairingCost = 0;

	for (const component of components) {
		if (component.length < 2) continue;

		const selectedEdges = solveBlossomComponent(component, graph.adjacency)
			.sort((left, right) => Math.min(left.i, left.j) - Math.min(right.i, right.j));

		for (const edge of selectedEdges) {
			pairings.push(edge.colors);
			matchedIndexes.add(edge.i);
			matchedIndexes.add(edge.j);
			totalPairingScore += edge.score;
			totalPairingCost += edge.cost;
		}
	}

	const leftovers = batch.filter((_, index) => !matchedIndexes.has(index));
	const exhaustedNoLegalPairPool = leftovers.length >= 2 && !hasLegalLeftoverEdge(leftovers, graph.edges, batch);

	return {
		pairings,
		leftovers,
		exhaustedNoLegalPairPool,
		strategy: 'graph',
		usedFallback: false,
		totalPairingScore,
		totalPairingCost: Number(totalPairingCost.toFixed(3)),
		legalEdgeCount: graph.edges.length,
	};
}

const selectBatchPairings = selectGraphBatchPairings;

module.exports = {
	selectBatchPairings,
	selectGraphBatchPairings,
	selectGreedyBatchPairings,
	buildPairingGraph,
	pairingCost,
};
