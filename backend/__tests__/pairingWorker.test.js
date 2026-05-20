const {
	selectBatchPairings,
	selectGreedyBatchPairings,
} = require('../src/services/pairing/selectBatchPairings');
const {
	DEFAULT_PAIRING_SETTLE_MS,
	parsePairingSettleMs,
} = require('../src/services/pairing/pairingConfig');

describe('pairing settle config', () => {
	test('defaults to a 30 second quiet window', () => {
		expect(DEFAULT_PAIRING_SETTLE_MS).toBe(30_000);
		expect(parsePairingSettleMs()).toBe(30_000);
		expect(parsePairingSettleMs('')).toBe(30_000);
		expect(parsePairingSettleMs('not-a-number')).toBe(30_000);
		expect(parsePairingSettleMs('-1')).toBe(30_000);
	});

	test('accepts explicit non-negative millisecond values', () => {
		expect(parsePairingSettleMs('0')).toBe(0);
		expect(parsePairingSettleMs('45000')).toBe(45_000);
		expect(parsePairingSettleMs(20_000)).toBe(20_000);
	});
});

describe('selectBatchPairings', () => {
	const makePlayer = (_id) => ({ _id });

	test('stops after exhausting all anchors when no legal pair exists', () => {
		const players = ['A', 'B', 'C', 'D'].map(makePlayer);
		const evaluator = jest.fn(() => ({ ok: false }));

		const result = selectBatchPairings(players, evaluator);

		expect(result.pairings).toEqual([]);
		expect(result.leftovers.map((player) => player._id).sort()).toEqual(['A', 'B', 'C', 'D']);
		expect(result.exhaustedNoLegalPairPool).toBe(true);
		expect(evaluator).toHaveBeenCalledTimes(6);
	});

	test('finds a legal pairing among three players after rotating away from an unmatched anchor', () => {
		const players = ['A', 'B', 'C'].map(makePlayer);
		const evaluator = (left, right) => {
			const ids = [left._id, right._id].sort().join('');
			if (ids !== 'BC') return { ok: false };
			return {
				ok: true,
				score: 1,
				colors: {
					white: left._id === 'B' ? left : right,
					black: left._id === 'B' ? right : left,
				},
			};
		};

		const result = selectBatchPairings(players, evaluator);

		expect(result.pairings).toHaveLength(1);
		expect(result.exhaustedNoLegalPairPool).toBe(false);
		expect(result.pairings[0].white._id).toBe('B');
		expect(result.pairings[0].black._id).toBe('C');
		expect(result.leftovers.map((player) => player._id)).toEqual(['A']);
	});

	test('graph selector maximizes game count when greedy anchor choice blocks a second game', () => {
		const players = ['A', 'B', 'C', 'D'].map(makePlayer);
		const evaluator = (left, right) => {
			const ids = [left._id, right._id].sort().join('');
			const scores = {
				AB: 0.99,
				AC: 0.9,
				BD: 0.9,
			};
			if (scores[ids] == null) return { ok: false };
			return {
				ok: true,
				score: scores[ids],
				colors: { white: left, black: right },
			};
		};

		const greedy = selectGreedyBatchPairings(players, evaluator);
		const graph = selectBatchPairings(players, evaluator);

		expect(greedy.pairings).toHaveLength(1);
		expect(graph.pairings).toHaveLength(2);
		expect(graph.leftovers).toEqual([]);
		expect(graph.usedFallback).toBe(false);
	});

	test('graph selector maximizes total score among maximum-cardinality matchings', () => {
		const players = ['A', 'B', 'C', 'D'].map(makePlayer);
		const evaluator = (left, right) => {
			const ids = [left._id, right._id].sort().join('');
			const scores = {
				AB: 10,
				CD: 1,
				AC: 8,
				BD: 8,
			};
			if (scores[ids] == null) return { ok: false };
			return {
				ok: true,
				score: scores[ids],
				colors: { white: left, black: right },
			};
		};

		const graph = selectBatchPairings(players, evaluator);
		const pairIds = graph.pairings
			.map(({ white, black }) => [white._id, black._id].sort().join(''))
			.sort();

		expect(graph.pairings).toHaveLength(2);
		expect(graph.totalPairingScore).toBe(16);
		expect(pairIds).toEqual(['AC', 'BD']);
	});

	test('graph selector supports components larger than the old exact-DP cap', () => {
		const players = Array.from({ length: 30 }, (_, index) => makePlayer(`P${String(index + 1).padStart(2, '0')}`));
		const evaluator = (left, right) => ({
			ok: true,
			score: 1 - Math.abs(Number(left._id.slice(1)) - Number(right._id.slice(1))) / 100,
			colors: { white: left, black: right },
		});

		const graph = selectBatchPairings(players, evaluator);

		expect(graph.pairings).toHaveLength(15);
		expect(graph.leftovers).toEqual([]);
		expect(graph.usedFallback).toBe(false);
		expect(graph.legalEdgeCount).toBe(435);
	});
});
