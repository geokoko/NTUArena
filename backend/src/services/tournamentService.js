const Tournament = require('../models/Tournament');
const Player = require('../models/Player');
const Game = require('../models/Game');
const User = require('../models/User');
const TournamentLog = require('../models/TournamentLog');
const pairingService = require('./pairingService');
const gameService = require('./gameService');
const { logEvent } = require('./tournamentLogger');
const { enqueue, removePlayerEverywhere } = require('./queue/redisQueue');
const {
	ensureDocumentPublicId,
	ensureDocumentsPublicId,
	findByIdOrPublicId,
	isObjectId,
	normalizeLookupId,
} = require('../utils/identifiers');

const makeError = (message, status = 400) => {
	const err = new Error(message);
	err.status = status;
	return err;
};

const normalizeUser = (user) => {
	if (!user) return {};
	if (typeof user.toObject === 'function') return user.toObject();
	return user;
};

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

const toPlain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc || {});

const getScheduler = () => require('./tournamentScheduler');

const parseOptionalDate = (value, fieldName) => {
	if (value === undefined) return undefined;
	if (value === null || value === '') return null;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		throw makeError(`Invalid ${fieldName}`);
	}
	return parsed;
};

const parsePositiveDurationMs = (value) => {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw makeError('durationMs must be a positive integer');
	}
	return parsed;
};

const parseSettleMs = (value) => {
	if (value === undefined) return undefined;
	if (value === null || value === '') return null;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 0 || parsed > 600000) {
		throw makeError('settleMs must be an integer between 0 and 600000');
	}
	return parsed;
};

const recomputeTournamentDates = (tournament) => {
	const baseStart = tournament.actualStartDate || tournament.scheduledStartDate || null;
	tournament.startDate = baseStart;
	tournament.endDate = baseStart && tournament.durationMs
		? new Date(baseStart.getTime() + Number(tournament.durationMs))
		: null;
};

const normalizeSeedRating = (value) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const buildInitialPlayerData = ({ tournamentId, user = null, tempName = null, seedRating = 0, isActiveTournament = false, now = new Date() }) => {
	const rating = normalizeSeedRating(seedRating);
	return {
		user: user?._id || null,
		tempName,
		tournament: tournamentId,
		isPlaying: false,
		waitingSince: isActiveTournament ? now : null,
		liveRating: rating,
		entryRating: rating,
		performanceRating: null,
		standing: null,
		score: 0,
		gamesPlayed: 0,
		wins: 0,
		draws: 0,
		losses: 0,
		sumOpponentRatings: 0,
		status: 'active',
		enteredAt: now,
	};
};

const playerQueueSnapshot = (player, { enqueuedAt = Date.now() } = {}) => ({
	_id: String(player._id),
	user: player.user || null,
	tempName: player.tempName || null,
	score: player.score ?? 0,
	liveRating: player.entryRating ?? player.liveRating ?? 0,
	entryRating: player.entryRating ?? 0,
	performanceRating: player.performanceRating ?? null,
	recentOpponents: (player.recentOpponents ?? []).map(String),
	colorHistory: player.colorHistory ?? [],
	status: player.status,
	waitingSince: player.waitingSince ?? null,
	enqueuedAt,
});

const summarizePlayer = (player) => {
	if (!player) return null;
	const base = toPlain(player);
	const user = base.user ? normalizeUser(base.user) : null;
	const gamesPlayed = Number.isFinite(base.gamesPlayed)
		? base.gamesPlayed
		: Array.isArray(base.gameHistory) ? base.gameHistory.length : 0;

	return {
		id: base.publicId || null,
		userId: user?.publicId || null,
		username: user?.username || null,
		isTemp: !base.user, // Flag indicating this is a temp player with no linked account
		name: buildDisplayName(user, base.tempName),
		score: base.score ?? 0,
		liveRating: base.entryRating ?? base.liveRating ?? user?.globalElo ?? 0,
		performanceRating: base.performanceRating ?? null,
		isPlaying: !!base.isPlaying,
		waitingSince: base.waitingSince ?? null,
		games: gamesPlayed,
		gamesPlayed,
		wins: base.wins ?? 0,
		draws: base.draws ?? 0,
		losses: base.losses ?? 0,
		status: base.status || 'active',
		entryRating: base.entryRating ?? user?.globalElo ?? 0,
		lastResultAt: base.lastResultAt ?? null,
		// Persisted rank within the tournament; null until the first game result is submitted.
		standing: base.standing ?? null,
	};
};

const ensurePlayerHierarchyIds = async (players) => {
	if (!Array.isArray(players)) return;
	await Promise.all(
		players.map(async (playerDoc) => {
			if (!playerDoc) return;
			await ensureDocumentPublicId(playerDoc, Player);
			if (playerDoc.user) {
				await ensureDocumentPublicId(playerDoc.user, User);
			}
		})
	);
};

const sanitizeTournamentSummary = (tournament) => {
	const base = toPlain(tournament);
	return {
		id: base.publicId || null,
		name: base.name || base.title || 'Untitled Tournament',
		tournStatus: base.tournStatus || 'upcoming',
		tournLocation: base.tournLocation || '',
		timeControl: base.timeControl || '',
		description: base.description || '',
		startDate: base.startDate,
		endDate: base.endDate,
		durationMs: base.durationMs ?? null,
		scheduledStartDate: base.scheduledStartDate ?? null,
		actualStartDate: base.actualStartDate ?? null,
		settleMs: base.settleMs ?? null,
		pairingClosedAt: base.pairingClosedAt ?? null,
		pairingClosedReason: base.pairingClosedReason ?? null,
		maxPlayers: base.maxPlayers ?? 100,
		participantCount: Array.isArray(base.participants) ? base.participants.length : 0,
	};
};

/**
 * Resolve a Player document within a tournament from either a User id/publicId
 * or directly a Player id/publicId (for temp players with no linked User account).
 */
async function resolvePlayerInTournament(idOrPublicId, tournamentObjectId) {
	const lookupId = normalizeLookupId(idOrPublicId);
	if (!lookupId) return null;

	const user = await findByIdOrPublicId(User, lookupId);
	if (user) {
		const p = await Player.findOne({ user: user._id, tournament: tournamentObjectId });
		if (p) return p;
	}

	// Fallback: temp player — look up by player objectId, then publicId.
	if (isObjectId(lookupId)) {
		const playerById = await Player.findOne({ _id: lookupId, tournament: tournamentObjectId });
		if (playerById) return playerById;
	}

	return Player.findOne({
		publicId: { $eq: lookupId },
		tournament: tournamentObjectId,
	});
}

class TournamentService {
	filterSettings(settings = {}) {
		if (settings.endDate !== undefined) {
			throw makeError('endDate is derived from scheduledStartDate/actualStartDate and durationMs');
		}

		const allowed = ['name', 'tournLocation', 'scheduledStartDate', 'durationMs', 'settleMs', 'timeControl', 'description', 'type', 'maxPlayers'];
		const filtered = {};
		for (const [key, value] of Object.entries(settings)) {
			if (value === undefined) continue;
			if (key === 'startDate' && settings.scheduledStartDate === undefined) {
				filtered.scheduledStartDate = value;
				continue;
			}
			if (key === 'title' && settings.name === undefined) {
				filtered.name = value;
				continue;
			}
			if (allowed.includes(key)) {
				filtered[key] = value;
			}
		}

		if (filtered.maxPlayers !== undefined) {
			const parsed = Number(filtered.maxPlayers);
			if (!Number.isFinite(parsed) || parsed <= 0) {
				throw makeError('maxPlayers must be a positive number');
			}
			filtered.maxPlayers = parsed;
		}

		if (filtered.durationMs !== undefined) {
			filtered.durationMs = parsePositiveDurationMs(filtered.durationMs);
		}

		if (filtered.settleMs !== undefined) {
			filtered.settleMs = parseSettleMs(filtered.settleMs);
		}

		return filtered;
	}

	async getAllTournaments() {
		const tournaments = await Tournament.find().sort({ startDate: 1 });
		await ensureDocumentsPublicId(tournaments, Tournament);
		return tournaments.map(sanitizeTournamentSummary);
	}

	async createTournament(data, { actor = null } = {}) {
		const filtered = this.filterSettings(data);

		if (!filtered.name) throw makeError('Tournament name is required');
		if (!filtered.durationMs) {
			throw makeError('durationMs is required');
		}

		const scheduledStartDate = parseOptionalDate(filtered.scheduledStartDate, 'scheduledStartDate');
		if (scheduledStartDate && scheduledStartDate <= new Date()) {
			throw makeError('scheduledStartDate must be in the future');
		}

		const tournament = new Tournament({
			...filtered,
			scheduledStartDate: scheduledStartDate ?? null,
			actualStartDate: null,
			maxPlayers: filtered.maxPlayers ?? 100,
			tournStatus: 'upcoming',
		});
		recomputeTournamentDates(tournament);

		await tournament.save();
		await ensureDocumentPublicId(tournament, Tournament);
		await logEvent(tournament._id, 'tournament.created', {
			message: 'Tournament created.',
			payload: sanitizeTournamentSummary(tournament),
			actor,
		});
		getScheduler().scheduleTournament(tournament);
		return sanitizeTournamentSummary(tournament);
	}

	async updateTournament(id, data, { actor = null } = {}) {
		const filtered = this.filterSettings(data);
		if (Object.keys(filtered).length === 0) {
			throw makeError('No valid fields provided to update');
		}

		const tournament = await findByIdOrPublicId(Tournament, id);
		if (!tournament) throw makeError('Tournament not found', 404);

		if (
			filtered.maxPlayers !== undefined &&
			filtered.maxPlayers < tournament.participants.length
		) {
			throw makeError('maxPlayers cannot be lower than the current participants count');
		}

		if (filtered.scheduledStartDate !== undefined) {
			filtered.scheduledStartDate = parseOptionalDate(filtered.scheduledStartDate, 'scheduledStartDate');
			if (filtered.scheduledStartDate && tournament.tournStatus === 'upcoming' && filtered.scheduledStartDate <= new Date()) {
				throw makeError('scheduledStartDate must be in the future');
			}
		}

		if (filtered.durationMs !== undefined && tournament.tournStatus !== 'upcoming') {
			throw makeError('durationMs can only be changed before the tournament starts');
		}
		if (filtered.scheduledStartDate !== undefined && tournament.tournStatus !== 'upcoming') {
			throw makeError('scheduledStartDate can only be changed before the tournament starts');
		}

		const previous = sanitizeTournamentSummary(tournament);
		Object.assign(tournament, filtered);
		recomputeTournamentDates(tournament);
		await tournament.save();
		await ensureDocumentPublicId(tournament, Tournament);
		const next = sanitizeTournamentSummary(tournament);
		await logEvent(tournament._id, 'tournament.updated', {
			message: 'Tournament settings updated.',
			payload: { before: previous, after: next },
			actor,
		});
		getScheduler().scheduleTournament(tournament);
		return sanitizeTournamentSummary(tournament);
	}

	async getTournamentById(id) {
		const tournamentDoc = await findByIdOrPublicId(Tournament, id);
		if (!tournamentDoc) throw makeError('Tournament not found', 404);
		await ensureDocumentPublicId(tournamentDoc, Tournament);
		await ensureDocumentPublicId(tournamentDoc, Tournament);

		await tournamentDoc.populate({
			path: 'participants',
			populate: { path: 'user', select: 'publicId username email globalElo profile.firstName profile.lastName' },
		});
		await ensurePlayerHierarchyIds(tournamentDoc.participants);

		const tournament = toPlain(tournamentDoc);
		const games = await this.getTournamentGames(tournament.publicId || tournament._id);

		return {
			...sanitizeTournamentSummary(tournament),
			participants: Array.isArray(tournament.participants)
				? tournament.participants.map(summarizePlayer)
				: [],
			games,
		};
	}

	async getTournamentPlayers(tournamentId) {
		const tournament = await findByIdOrPublicId(Tournament, tournamentId);
		if (!tournament) throw makeError('Tournament not found', 404);

		const players = await Player.find({ tournament: tournament._id })
			.populate('user', 'publicId username email globalElo profile.firstName profile.lastName')
			.sort({ score: -1, performanceRating: -1, entryRating: -1 });
		await ensureDocumentsPublicId(players, Player);
		await ensurePlayerHierarchyIds(players);

		return players.map(summarizePlayer);
	}

	async getTournamentGames(tournamentId) {
		const tournament = await findByIdOrPublicId(Tournament, tournamentId);
		if (!tournament) throw makeError('Tournament not found', 404);

		const games = await Game.find({ tournament: tournament._id })
			.sort({ createdAt: -1 })
			.populate({
				path: 'playerWhite',
				populate: { path: 'user', select: 'publicId username email globalElo profile.firstName profile.lastName' },
			})
			.populate({
				path: 'playerBlack',
				populate: { path: 'user', select: 'publicId username email globalElo profile.firstName profile.lastName' },
			});
		await ensureDocumentsPublicId(games, Game);
		await Promise.all(
			games.map(async (gameDoc) => {
				if (gameDoc?.playerWhite) {
					await ensureDocumentPublicId(gameDoc.playerWhite, Player);
					if (gameDoc.playerWhite.user) {
						await ensureDocumentPublicId(gameDoc.playerWhite.user, User);
					}
				}
				if (gameDoc?.playerBlack) {
					await ensureDocumentPublicId(gameDoc.playerBlack, Player);
					if (gameDoc.playerBlack.user) {
						await ensureDocumentPublicId(gameDoc.playerBlack.user, User);
					}
				}
			})
		);

		return games.map((gameDoc) => {
			const game = toPlain(gameDoc);
			return {
				id: game.publicId || null,
				startedAt: game.createdAt,
				finishedAt: game.finishedAt || null,
				isFinished: !!game.isFinished,
				isCancelled: !!game.isCancelled,
				cancelledAt: game.cancelledAt || null,
				boardNumber: game.boardNumber ?? null,
				resultColor: game.resultColor || null,
				playerWhite: summarizePlayer(game.playerWhite),
				playerBlack: summarizePlayer(game.playerBlack),
			};
		});
	}

	async getTournamentStandings(tournamentId) {
		const tournament = await findByIdOrPublicId(Tournament, tournamentId);
		if (!tournament) throw makeError('Tournament not found', 404);

		const players = await Player.find({ tournament: tournament._id })
			.populate('user', 'publicId username email globalElo profile.firstName profile.lastName');
		await ensureDocumentsPublicId(players, Player);
		await ensurePlayerHierarchyIds(players);

		// Rank from current score state. `standing` is a persisted cache and can
		// briefly lag behind a just-submitted result.
		players.sort((a, b) => {
			const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
			if (scoreDiff !== 0) return scoreDiff;
			const perfDiff = (b.performanceRating ?? -1) - (a.performanceRating ?? -1);
			if (perfDiff !== 0) return perfDiff;
			return (b.entryRating ?? 0) - (a.entryRating ?? 0);
		});

		return players.map((player, index) => {
			const summary = summarizePlayer(player);
			return {
				rank: index + 1,
				player: {
					id: summary?.id,
					userId: summary?.userId,
					username: summary?.username,
					name: summary?.name,
					status: summary?.status,
				},
				score: summary?.score ?? 0,
				games: summary?.games ?? 0,
				liveRating: summary?.liveRating ?? 0,
				performanceRating: summary?.performanceRating ?? null,
				wins: summary?.wins ?? 0,
				draws: summary?.draws ?? 0,
				losses: summary?.losses ?? 0,
				entryRating: summary?.entryRating ?? 0,
				lastResultAt: summary?.lastResultAt ?? null,
			};
		});
	}

	async startTournament(id, { actor = null, trigger = 'manual', actualStartDate = null } = {}) {
		const tournament = await findByIdOrPublicId(Tournament, id);
		if (!tournament) throw makeError('Tournament not found', 404);
		if (tournament.tournStatus !== 'upcoming') {
			throw makeError('Tournament already started or completed');
		}

		const startAt = actualStartDate || new Date();
		tournament.tournStatus = 'in progress';
		tournament.actualStartDate = startAt;
		tournament.pairingClosedAt = null;
		tournament.pairingClosedReason = null;
		recomputeTournamentDates(tournament);
		await tournament.save();
		await ensureDocumentPublicId(tournament, Tournament);

		await logEvent(tournament._id, 'tournament.started', {
			message: `Tournament started (${trigger}).`,
			payload: {
				trigger,
				actualStartDate: tournament.actualStartDate,
				endDate: tournament.endDate,
				durationMs: tournament.durationMs,
			},
			actor,
		});
		getScheduler().scheduleTournament(tournament);
		pairingService.startPairingLoop(String(tournament._id));
		return sanitizeTournamentSummary(tournament);
	}

	async startTournamentAuto(id) {
		const tournament = await findByIdOrPublicId(Tournament, id);
		if (!tournament || tournament.tournStatus !== 'upcoming' || !tournament.scheduledStartDate) {
			return null;
		}
		return this.startTournament(tournament.publicId || tournament._id, {
			trigger: 'auto',
			actualStartDate: tournament.scheduledStartDate,
		});
	}

	async endTournament(id, { actor = null, trigger = 'manual' } = {}) {
		const tournament = await findByIdOrPublicId(Tournament, id);
		if (!tournament) throw makeError('Tournament not found', 404);
		if (!['in progress', 'finishing'].includes(tournament.tournStatus)) {
			throw makeError('Tournament not in progress');
		}

		const activeGames = await Game.countDocuments({
			tournament: tournament._id,
			isFinished: false,
			isCancelled: { $ne: true },
		});
		tournament.tournStatus = activeGames > 0 ? 'finishing' : 'completed';
		tournament.pairingClosedAt = new Date();
		tournament.pairingClosedReason = trigger;
		await tournament.save();
		await ensureDocumentPublicId(tournament, Tournament);

		pairingService.stopPairingLoop(String(tournament._id));
		getScheduler().clearTournament(String(tournament._id));
		await logEvent(tournament._id, 'tournament.ended', {
			message: activeGames > 0
				? 'Tournament pairing ended; waiting for active games to finish.'
				: 'Tournament ended.',
			payload: { trigger, activeGames, status: tournament.tournStatus },
			actor,
		});
		return sanitizeTournamentSummary(tournament);
	}

	async deleteTournament(id, { actor = null } = {}) {
		const tournament = await findByIdOrPublicId(Tournament, id);
		if (!tournament) throw makeError('Tournament not found', 404);
		if (tournament.tournStatus === 'in progress') {
			throw makeError('Cannot delete an in-progress tournament; end it first.');
		}

		await Promise.all([
			Player.deleteMany({ tournament: tournament._id }),
			Game.deleteMany({ tournament: tournament._id }),
			TournamentLog.deleteMany({ tournamentId: tournament._id }),
		]);
		await tournament.deleteOne();
		getScheduler().clearTournament(String(tournament._id));
		await logEvent(tournament._id, 'tournament.deleted', {
			message: 'Tournament deleted.',
			payload: { id: tournament.publicId || String(tournament._id), name: tournament.name },
			actor,
		});
		return { message: 'Tournament deleted' };
	}

	async joinTournament(userId, tournamentId, { seedRatingOverride = null } = {}) {
		const [tournament, user] = await Promise.all([
			findByIdOrPublicId(Tournament, tournamentId),
			findByIdOrPublicId(User, userId),
		]);

		if (!tournament) throw makeError('Tournament not found', 404);
		if (!user) throw makeError('User not found', 404);
		if (tournament.tournStatus === 'completed') {
			throw makeError('Tournament already completed');
		}

		if (
			typeof tournament.maxPlayers === 'number' &&
			tournament.maxPlayers > 0
		) {
			const activeCount = await Player.countDocuments({ tournament: tournament._id, status: { $nin: ['withdrawn'] } });
			if (activeCount >= tournament.maxPlayers) {
				throw makeError('Tournament is full');
			}
		}

		const exists = await Player.findOne({ user: user._id, tournament: tournament._id });
		if (exists) throw makeError('User already joined the tournament');

		const now = new Date();
		const seedRating = seedRatingOverride !== null && seedRatingOverride !== undefined
			? seedRatingOverride
			: user.globalElo;
		const isActiveTournament = tournament.tournStatus === 'in progress';

		const player = new Player(buildInitialPlayerData({
			tournamentId: tournament._id,
			user,
			seedRating,
			isActiveTournament,
			now,
		}));
		await player.save();

		await Tournament.updateOne(
			{ _id: tournament._id },
			{ $addToSet: { participants: player._id } }
		);

		if (isActiveTournament) {
			await enqueue(String(tournament._id), playerQueueSnapshot(player));
		}

		await ensureDocumentPublicId(player, Player);
		return summarizePlayer(await player.populate('user', 'publicId username email profile.firstName profile.lastName globalElo'));
	}

	async leaveTournament(userId, tournamentId, { actor = null } = {}) {
		const tournament = await findByIdOrPublicId(Tournament, tournamentId);
		if (!tournament) throw makeError('Tournament not found', 404);

		const player = await resolvePlayerInTournament(userId, tournament._id);
		if (!player) throw makeError('Player not found in tournament', 404);

		if (player.isPlaying) {
			await gameService.cancelActiveGameForPlayer(player, tournament, {
				reason: 'player.withdrawn',
				actor,
			});
		}

		player.status = 'withdrawn';
		player.withdrawnAt = new Date();
		player.waitingSince = null;
		player.isPlaying = false;
		await player.save();

		tournament.participants = (tournament.participants || []).filter(
			(id) => id.toString() !== player._id.toString()
		);
		await tournament.save();

		await removePlayerEverywhere(String(tournament._id), player._id);
		await ensureDocumentPublicId(player, Player);
		await player.populate('user', 'publicId username email globalElo profile.firstName profile.lastName');
		if (player.user) await ensureDocumentPublicId(player.user, User);
		await logEvent(tournament._id, 'intervention.manual', {
			message: 'Player withdrawn from tournament.',
			payload: { playerId: player.publicId || String(player._id), userId },
			actor,
		});

		return {
			message: 'Player withdrawn from tournament successfully',
			player: summarizePlayer(player),
		};
	}

	async adminAddPlayerToTournament(userId, tournamentId, { actor = null } = {}) {
		const player = await this.joinTournament(userId, tournamentId);
		const tournament = await findByIdOrPublicId(Tournament, tournamentId);
		if (tournament) {
			await logEvent(tournament._id, 'intervention.manual', {
				message: 'Player added to tournament.',
				payload: { userId, playerId: player.id },
				actor,
			});
		}
		return player;
	}

	async adminRemovePlayerFromTournament(userId, tournamentId, { actor = null } = {}) {
		return this.leaveTournament(userId, tournamentId, { actor });
	}

	async pausePlayer(userId, tournamentId, { actor = null } = {}) {
		const tournament = await findByIdOrPublicId(Tournament, tournamentId);
		if (!tournament) throw makeError('Tournament not found', 404);

		const player = await resolvePlayerInTournament(userId, tournament._id);
		if (!player) throw makeError('Player not found in tournament', 404);
		if (player.status === 'withdrawn') {
			throw makeError('Player already withdrawn from the tournament');
		}

		if (player.isPlaying) {
			await gameService.cancelActiveGameForPlayer(player, tournament, {
				reason: 'player.paused',
				actor,
			});
		}

		player.status = 'paused';
		player.pausedAt = new Date();
		player.waitingSince = null;
		await player.save();

		await removePlayerEverywhere(String(tournament._id), player._id);
		await ensureDocumentPublicId(player, Player);
		await player.populate('user', 'publicId username email globalElo profile.firstName profile.lastName');
		if (player.user) await ensureDocumentPublicId(player.user, User);
		await logEvent(tournament._id, 'intervention.manual', {
			message: 'Player paused.',
			payload: { playerId: player.publicId || String(player._id), userId },
			actor,
		});
		return summarizePlayer(player);
	}

	async resumePlayer(userId, tournamentId, { actor = null } = {}) {
		const tournament = await findByIdOrPublicId(Tournament, tournamentId);
		if (!tournament) throw makeError('Tournament not found', 404);

		const player = await resolvePlayerInTournament(userId, tournament._id);
		if (!player) throw makeError('Player not found in tournament', 404);
		if (player.status === 'withdrawn') {
			throw makeError('Withdrawn players cannot be resumed');
		}

		player.status = 'active';
		player.pausedAt = null;
		const now = new Date();
		const inProgress = tournament.tournStatus === 'in progress';
		player.waitingSince = inProgress ? now : null;
		await player.save();
		await ensureDocumentPublicId(player, Player);
		await player.populate('user', 'publicId username email globalElo profile.firstName profile.lastName');
		if (player.user) await ensureDocumentPublicId(player.user, User);

		if (inProgress) {
			await enqueue(String(tournament._id), playerQueueSnapshot(player));
		}

		await logEvent(tournament._id, 'intervention.manual', {
			message: 'Player resumed.',
			payload: { playerId: player.publicId || String(player._id), userId },
			actor,
		});
		return summarizePlayer(player);
	}

	/**
	 * Bulk add players to a tournament by username or email identifier.
	 * @param {string} tournamentId - Tournament ID or publicId
	 * @param {string[]} identifiers - Array of usernames or emails
	 * @returns {{ added: Object[], skipped: Object[], errors: Object[] }}
	 */
	async bulkAddPlayersByIdentifier(tournamentId, identifiers) {
		const results = {
			added: [],
			skipped: [],
			errors: [],
		};

		if (!Array.isArray(identifiers) || identifiers.length === 0) {
			return results;
		}

		const tournament = await findByIdOrPublicId(Tournament, tournamentId);
		if (!tournament) {
			throw makeError('Tournament not found', 404);
		}

		// Pre-fetch all users that match any identifier
		const normalizedIdentifiers = identifiers.map((id) => id.trim().toLowerCase());
		const matchingUsers = await User.find({
			isDeleted: { $ne: true },
			$or: [
				{ username: { $in: identifiers.map((id) => new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) } },
				{ email: { $in: identifiers.map((id) => new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) } },
			],
		});

		// Build lookup maps
		const userByUsername = new Map();
		const userByEmail = new Map();
		for (const user of matchingUsers) {
			if (user.username) userByUsername.set(user.username.toLowerCase(), user);
			if (user.email) userByEmail.set(user.email.toLowerCase(), user);
		}

		// Get existing players in this tournament
		const existingPlayers = await Player.find({ tournament: tournament._id }).select('user');
		const existingUserIds = new Set(existingPlayers.filter((p) => p.user).map((p) => p.user.toString()));

		for (let i = 0; i < identifiers.length; i++) {
			const identifier = identifiers[i].trim();
			const lowerIdentifier = identifier.toLowerCase();
			const rowNum = i + 1;

			try {
				// Look up user by username or email
				const user = userByUsername.get(lowerIdentifier) || userByEmail.get(lowerIdentifier);
				
				if (!user) {
					results.errors.push({
						row: rowNum,
						identifier,
						error: 'User not found',
					});
					continue;
				}

				// Check if already in tournament
				if (existingUserIds.has(user._id.toString())) {
					results.skipped.push({
						row: rowNum,
						identifier,
						reason: 'User already in tournament',
						userId: user.publicId || user._id.toString(),
					});
					continue;
				}

				// Add player to tournament
				const player = await this.joinTournament(user.publicId || user._id.toString(), tournamentId);
				results.added.push({
					row: rowNum,
					identifier,
					player,
				});

				// Track for in-batch duplicate detection
				existingUserIds.add(user._id.toString());
			} catch (err) {
				results.errors.push({
					row: rowNum,
					identifier,
					error: err.message || 'Unknown error',
				});
			}
		}

		return results;
	}

	async bulkAddPlayers(tournamentId, userIds, { actor = null } = {}) {
		const results = {
			added: [],
			skipped: [],
			errors: [],
		};

		if (!Array.isArray(userIds) || userIds.length === 0) {
			return results;
		}

		const tournament = await findByIdOrPublicId(Tournament, tournamentId);
		if (!tournament) throw makeError('Tournament not found', 404);

		const uniqueIds = [...new Set(userIds.map((id) => String(id).trim()).filter(Boolean))];
		if (!uniqueIds.length) return results;
		const mongoIds = uniqueIds.filter(isObjectId);
		const publicIds = uniqueIds.filter((id) => !isObjectId(id));
		const users = await User.find({
			isDeleted: { $ne: true },
			$or: [
				...(mongoIds.length ? [{ _id: { $in: mongoIds } }] : []),
				...(publicIds.length ? [{ publicId: { $in: publicIds } }] : []),
			],
		});

		const userByLookup = new Map();
		for (const user of users) {
			userByLookup.set(String(user._id), user);
			if (user.publicId) userByLookup.set(String(user.publicId), user);
		}

		for (const userId of uniqueIds) {
			const user = userByLookup.get(userId);
			if (!user) {
				results.errors.push({ userId, error: 'User not found' });
				continue;
			}

			try {
				const player = await this.joinTournament(user.publicId || String(user._id), tournament.publicId || String(tournament._id));
				results.added.push({ userId: user.publicId || String(user._id), player });
			} catch (err) {
				const message = err.message || 'Unknown error';
				if (/already joined|already in tournament/i.test(message)) {
					results.skipped.push({ userId: user.publicId || String(user._id), reason: 'User already in tournament' });
				} else if (/full/i.test(message)) {
					results.skipped.push({ userId: user.publicId || String(user._id), reason: 'Tournament is full' });
				} else {
					results.errors.push({ userId: user.publicId || String(user._id), error: message });
				}
			}
		}

		await logEvent(tournament._id, 'intervention.manual', {
			message: 'Bulk player add completed.',
			payload: {
				requested: uniqueIds.length,
				added: results.added.length,
				skipped: results.skipped.length,
				errors: results.errors.length,
			},
			actor,
		});

		return results;
	}

	async getTournamentLogs(tournamentId, filters = {}) {
		const tournament = await findByIdOrPublicId(Tournament, tournamentId);
		if (!tournament) throw makeError('Tournament not found', 404);

		const query = { tournamentId: tournament._id };
		if (filters.eventType) {
			const eventTypes = Array.isArray(filters.eventType)
				? filters.eventType
				: String(filters.eventType).split(',').map((type) => type.trim()).filter(Boolean);
			if (eventTypes.length) query.eventType = { $in: eventTypes };
		}
		if (filters.roundNumber !== undefined && filters.roundNumber !== '') {
			const roundNumber = Number(filters.roundNumber);
			if (Number.isInteger(roundNumber) && roundNumber > 0) query.roundNumber = roundNumber;
		}
		if (filters.before) {
			const before = new Date(filters.before);
			if (!Number.isNaN(before.getTime())) query.createdAt = { $lt: before };
		}

		const limit = Math.min(Math.max(Number(filters.limit) || 100, 1), 250);
		const logs = await TournamentLog.find(query)
			.sort({ createdAt: -1 })
			.limit(limit)
			.lean();

		return logs.map((log) => ({
			id: String(log._id),
			eventType: log.eventType,
			message: log.message,
			payload: log.payload,
			actor: log.actor,
			roundNumber: log.roundNumber ?? null,
			createdAt: log.createdAt,
		}));
	}

	/**
	 * Bulk add players to a tournament from CSV data.
	 * Creates temp players if no user account found, or links to existing user if identifier matches.
	 * @param {string} tournamentId - Tournament ID or publicId
	 * @param {Object[]} rows - Array of parsed CSV row objects with name, rating, identifier (optional)
	 * @returns {{ added: Object[], skipped: Object[], errors: Object[] }}
	 */
	async bulkAddPlayersFromCSV(tournamentId, rows) {
		const results = {
			added: [],
			skipped: [],
			errors: [],
		};

		if (!Array.isArray(rows) || rows.length === 0) {
			return results;
		}

		const tournament = await findByIdOrPublicId(Tournament, tournamentId);
		if (!tournament) {
			throw makeError('Tournament not found', 404);
		}

		// Check tournament capacity
		const isActiveTournament = tournament.tournStatus === 'in progress';

		// Collect all identifiers to pre-fetch matching users
		const identifiersToLookup = rows
			.filter((row) => row.identifier && row.identifier.trim())
			.map((row) => row.identifier.trim());

		// Pre-fetch users that match identifiers
		let userByUsername = new Map();
		let userByEmail = new Map();
		if (identifiersToLookup.length > 0) {
			const matchingUsers = await User.find({
				isDeleted: { $ne: true },
				$or: [
					{ username: { $in: identifiersToLookup.map((id) => new RegExp(`^${id.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}$`, 'i')) } },
					{ email: { $in: identifiersToLookup.map((id) => new RegExp(`^${id.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}$`, 'i')) } },
				],
			});
			for (const user of matchingUsers) {
				if (user.username) userByUsername.set(user.username.toLowerCase(), user);
				if (user.email) userByEmail.set(user.email.toLowerCase(), user);
			}
		}

		// Get existing players in this tournament (both user-linked and temp)
		const existingPlayers = await Player.find({ tournament: tournament._id }).select('user tempName');
		const existingUserIds = new Set(
			existingPlayers.filter((p) => p.user).map((p) => p.user.toString())
		);
		const existingTempNames = new Set(
			existingPlayers.filter((p) => p.tempName).map((p) => p.tempName.toLowerCase())
		);

		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			const rowNum = row._rowNumber || (i + 2); // CSV row number (header is row 1)
			const name = (row.name || '').trim();
			const ratingStr = (row.rating || '').toString().trim();
			const identifier = (row.identifier || '').trim();

			try {
				// Validate required fields
				if (!name) {
					results.errors.push({ row: rowNum, name, error: 'Name is required' });
					continue;
				}
				const rating = parseInt(ratingStr, 10);
				if (!Number.isFinite(rating) || rating < 0) {
					results.errors.push({ row: rowNum, name, error: 'Valid rating is required' });
					continue;
				}

				// Check if identifier links to an existing user
				let linkedUser = null;
				if (identifier) {
					const lowerIdentifier = identifier.toLowerCase();
					linkedUser = userByUsername.get(lowerIdentifier) || userByEmail.get(lowerIdentifier);
				}

				if (linkedUser) {
					// Check if user already in tournament
					if (existingUserIds.has(linkedUser._id.toString())) {
						results.skipped.push({
							row: rowNum,
							name,
							reason: 'User already in tournament',
							userId: linkedUser.publicId || linkedUser._id.toString(),
						});
						continue;
					}

					// Add linked player via existing joinTournament method
					const player = await this.joinTournament(
						linkedUser.publicId || linkedUser._id.toString(),
						tournamentId,
						{ seedRatingOverride: rating }
					);
					results.added.push({ row: rowNum, name, player, linked: true });
					existingUserIds.add(linkedUser._id.toString());
				} else {
					// Create temp player (no linked user)
					// Check for duplicate temp names
					if (existingTempNames.has(name.toLowerCase())) {
						results.skipped.push({
							row: rowNum,
							name,
							reason: 'Temp player with this name already exists',
						});
						continue;
					}

					const now = new Date();
					const player = new Player(buildInitialPlayerData({
						tournamentId: tournament._id,
						tempName: name,
						seedRating: rating,
						isActiveTournament,
						now,
					}));
					await player.save();

					await Tournament.updateOne(
						{ _id: tournament._id },
						{ $addToSet: { participants: player._id } }
					);

					if (isActiveTournament) {
						await enqueue(String(tournament._id), playerQueueSnapshot(player));
					}

					await ensureDocumentPublicId(player, Player);
					results.added.push({
						row: rowNum,
						name,
						player: summarizePlayer(player),
						linked: false,
					});
					existingTempNames.add(name.toLowerCase());
				}
			} catch (err) {
				results.errors.push({
					row: rowNum,
					name,
					error: err.message || 'Unknown error',
				});
			}
		}

		return results;
	}
}

module.exports = new TournamentService();
