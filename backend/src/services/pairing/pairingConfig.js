const DEFAULT_PAIRING_SETTLE_MS = 30_000;

function parsePairingSettleMs(value = process.env.PAIRING_SETTLE_MS) {
	if (value === undefined || value === null || value === '') {
		return DEFAULT_PAIRING_SETTLE_MS;
	}

	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return DEFAULT_PAIRING_SETTLE_MS;
	}

	return Math.round(parsed);
}

module.exports = {
	DEFAULT_PAIRING_SETTLE_MS,
	parsePairingSettleMs,
};
