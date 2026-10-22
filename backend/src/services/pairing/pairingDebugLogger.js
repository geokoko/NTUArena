const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', '..', 'logs');
const MAX_BYTES = 2 * 1024 * 1024;

async function rotateIfNeeded(filePath) {
	try {
		const stat = await fs.promises.stat(filePath);
		if (stat.size < MAX_BYTES) return;
		await fs.promises.rename(filePath, `${filePath}.1`);
	} catch (err) {
		if (err.code !== 'ENOENT') throw err;
	}
}

async function debugPairing(tournamentId, event, payload = {}) {
	if (process.env.DEBUG_PAIRING !== 'true') return;
	const safeId = String(tournamentId).replace(/[^a-zA-Z0-9_-]/g, '_');
	const filePath = path.join(LOG_DIR, `tournament-${safeId}.log`);
	const line = JSON.stringify({
		at: new Date().toISOString(),
		event,
		...payload,
	});

	try {
		await fs.promises.mkdir(LOG_DIR, { recursive: true });
		await rotateIfNeeded(filePath);
		await fs.promises.appendFile(filePath, `${line}\n`);
	} catch (err) {
		if (process.env.NODE_ENV !== 'test') {
			console.error('[PairingDebugLogger] failed to append log:', err.message);
		}
	}
}

module.exports = { debugPairing };
