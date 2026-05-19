const { evaluatePair } = require('./pairingScorer');

const DEFAULT_MAX_EXACT_COMPONENT_VERTICES = 24;
const EPSILON = 1e-9;

function isBetterMatch(candidate, incumbent) {
	if (!incumbent) return true;
	if (candidate.count !== incumbent.count) return candidate.count > incumbent.count;
	if (Math.abs(candidate.score - incumbent.score) > EPSILON) {
		return candidate.score > incumbent.score;
	}
	return candidate.tieKey < incumbent.tieKey;
}

function pairTieKey(edges) {
	return edges
		.map((edge) => `${String(edge.colors.white._id)}-${String(edge.colors.black._id)}`)
		.sort()
		.join('|');
}

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

function buildPairingGraph(batch, evaluatePairFn = evaluatePair) {
	const edges = [];
	const adjacency = Array.from({ length: batch.length }, () => []);

	for (let i = 0; i < batch.length; i++) {
		for (let j = i + 1; j < batch.length; j++) {
			const evaluation = evaluatePairFn(batch[i], batch[j]);
			if (!evaluation.ok) continue;

			const edge = {
				i,
				j,
				score: evaluation.score,
				colors: evaluation.colors,
			};
			edges.push(edge);
			adjacency[i].push(edge);
			adjacency[j].push(edge);
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

function solveExactComponent(vertices, adjacency) {
	const localIndex = new Map(vertices.map((vertex, index) => [vertex, index]));
	const localEdges = Array.from({ length: vertices.length }, () => []);

	for (const vertex of vertices) {
		const sourceLocal = localIndex.get(vertex);
		for (const edge of adjacency[vertex]) {
			const other = edge.i === vertex ? edge.j : edge.i;
			if (!localIndex.has(other)) continue;
			const targetLocal = localIndex.get(other);
			if (sourceLocal < targetLocal) {
				localEdges[sourceLocal].push({ ...edge, targetLocal });
			}
		}
	}

	const memo = new Map();
	const fullMask = (1n << BigInt(vertices.length)) - 1n;

	function solve(mask) {
		if (mask === 0n) return { count: 0, score: 0, edges: [], tieKey: '' };
		if (memo.has(mask)) return memo.get(mask);

		let firstLocal = 0;
		while ((mask & (1n << BigInt(firstLocal))) === 0n) {
			firstLocal += 1;
		}

		const firstBit = 1n << BigInt(firstLocal);
		const withoutFirst = mask & ~firstBit;
		let best = solve(withoutFirst);

		for (const edge of localEdges[firstLocal]) {
			const targetBit = 1n << BigInt(edge.targetLocal);
			if ((mask & targetBit) === 0n) continue;

			const rest = solve(withoutFirst & ~targetBit);
			const candidateEdges = [...rest.edges, edge];
			const candidate = {
				count: rest.count + 1,
				score: rest.score + edge.score,
				edges: candidateEdges,
				tieKey: pairTieKey(candidateEdges),
			};

			if (isBetterMatch(candidate, best)) best = candidate;
		}

		memo.set(mask, best);
		return best;
	}

	return solve(fullMask);
}

function hasLegalLeftoverEdge(leftovers, graphEdges, batch) {
	const leftoverIds = new Set(leftovers.map((player) => String(player._id)));
	return graphEdges.some((edge) => (
		leftoverIds.has(String(batch[edge.i]._id)) &&
		leftoverIds.has(String(batch[edge.j]._id))
	));
}

function selectGraphBatchPairings(batch, evaluatePairFn = evaluatePair, options = {}) {
	const maxExactComponentVertices = options.maxExactComponentVertices ?? DEFAULT_MAX_EXACT_COMPONENT_VERTICES;
	const graph = buildPairingGraph(batch, evaluatePairFn);
	const components = connectedComponents(batch.length, graph.adjacency);
	const pairings = [];
	const matchedIndexes = new Set();
	let usedFallback = false;
	let totalPairingScore = 0;

	for (const component of components) {
		if (component.length < 2) continue;

		if (component.length > maxExactComponentVertices) {
			usedFallback = true;
			const componentBatch = component.map((index) => batch[index]);
			const fallback = selectGreedyBatchPairings(componentBatch, evaluatePairFn);
			for (const pairing of fallback.pairings) {
				pairings.push(pairing);
				matchedIndexes.add(batch.findIndex((player) => String(player._id) === String(pairing.white._id)));
				matchedIndexes.add(batch.findIndex((player) => String(player._id) === String(pairing.black._id)));
			}
			totalPairingScore += fallback.totalPairingScore;
			continue;
		}

		const solution = solveExactComponent(component, graph.adjacency);
		const selectedEdges = [...solution.edges].sort((left, right) => Math.min(left.i, left.j) - Math.min(right.i, right.j));

		for (const edge of selectedEdges) {
			pairings.push(edge.colors);
			matchedIndexes.add(edge.i);
			matchedIndexes.add(edge.j);
			totalPairingScore += edge.score;
		}
	}

	const leftovers = batch.filter((_, index) => !matchedIndexes.has(index));
	const exhaustedNoLegalPairPool = leftovers.length >= 2 && !hasLegalLeftoverEdge(leftovers, graph.edges, batch);

	return {
		pairings,
		leftovers,
		exhaustedNoLegalPairPool,
		strategy: 'graph',
		usedFallback,
		totalPairingScore,
		legalEdgeCount: graph.edges.length,
	};
}

const selectBatchPairings = selectGraphBatchPairings;

module.exports = {
	selectBatchPairings,
	selectGraphBatchPairings,
	selectGreedyBatchPairings,
	buildPairingGraph,
};
