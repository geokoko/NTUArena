const { evaluatePair } = require('../src/services/pairing/pairingScorer');

const player = (id, overrides = {}) => ({
	_id: id, score: 0, entryRating: 1500, recentOpponents: [], colorHistory: [], lastCancelledOpponent: null, ...overrides,
});

test('a manually cancelled pairing is not proposed again', () => {
	const a = player('a', { lastCancelledOpponent: 'b' });
	const b = player('b', { lastCancelledOpponent: 'a' });
	expect(evaluatePair(a, b)).toEqual({ ok: false, reason: 'cancelled_pairing' });
	expect(evaluatePair(b, player('c'))).toMatchObject({ ok: true });
});
