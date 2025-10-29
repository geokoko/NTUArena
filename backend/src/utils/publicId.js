const crypto = require('crypto');

const DEFAULT_BYTES = 9; // ~12 chars when base64url encoded

function createPublicId(bytes = DEFAULT_BYTES) {
	return crypto.randomBytes(bytes).toString('base64url');
}

module.exports = {
	createPublicId,
};

