// A player's name for display: the account's full name, else its username or
// email. CSV temp players have no account, only a tempName.
const buildDisplayName = (user, tempName = null) => {
	if (!user) {
		return tempName || 'Unknown Player';
	}
	const first = user?.profile?.firstName?.trim?.() || '';
	const last = user?.profile?.lastName?.trim?.() || '';
	const parts = [first, last].filter(Boolean);
	if (parts.length) return parts.join(' ');
	return user?.username || user?.email || tempName || 'Unknown Player';
};

module.exports = { buildDisplayName };
