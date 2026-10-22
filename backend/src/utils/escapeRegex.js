/** Escape special regex characters to prevent ReDoS / injection */
function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Exact, case-insensitive match for a user-supplied string */
function exactCaseInsensitive(str) {
	return new RegExp(`^${escapeRegex(str)}$`, 'i');
}

module.exports = {
	escapeRegex,
	exactCaseInsensitive,
};
