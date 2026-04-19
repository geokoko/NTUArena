const { selectBatchPairings } = require('../src/services/pairing/selectBatchPairings');

describe('selectBatchPairings', () => {
	const makePlayer = (_id) => ({ _id });

	test('stops after exhausting all anchors when no legal pair exists', () => {
		const players = ['A', 'B', 'C', 'D'].map(makePlayer);
		const evaluator = jest.fn(() => ({ ok: false }));

		const result = selectBatchPairings(players, evaluator);

		expect(result.pairings).toEqual([]);
		expect(result.leftovers.map((player) => player._id).sort()).toEqual(['A', 'B', 'C', 'D']);
		expect(result.exhaustedNoLegalPairPool).toBe(true);
		expect(evaluator).toHaveBeenCalledTimes(12);
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
});
