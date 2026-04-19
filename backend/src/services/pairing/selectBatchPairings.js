const { evaluatePair } = require('./pairingScorer');

function selectBatchPairings(batch, evaluatePairFn = evaluatePair) {
	const remaining = [...batch];
	const pairings = [];
	let stalledRotations = 0;
	let exhaustedNoLegalPairPool = false;

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
	}

	return { pairings, leftovers: remaining, exhaustedNoLegalPairPool };
}

module.exports = { selectBatchPairings };
