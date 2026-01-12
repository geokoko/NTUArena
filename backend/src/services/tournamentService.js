const Tournament = require('../models/Tournament');
const Player = require('../models/Player');
const Game = require('../models/Game');
const User = require('../models/User');
const pairingService = require('./pairingService');
const { enqueue, removePlayerEverywhere } = require('./queue/redisQueue');
const {
	ensureDocumentPublicId,
	ensureDocumentsPublicId,
	findByIdOrPublicId,
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

const buildDisplayName = (user) => {
	if (!user) return 'Unknown Player';
	const first = user?.profile?.firstName?.trim?.() || '';
	const last = user?.profile?.lastName?.trim?.() || '';
	const parts = [first, last].filter(Boolean);
	if (parts.length) return parts.join(' ');
	return user?.username || user?.email || 'Unknown Player';
};

const toPlain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc || {});

const summarizePlayer = (player) => {
	if (!player) return null;
	const base = toPlain(player);
	const user = normalizeUser(base.user);
	const gamesPlayed = Number.isFinite(base.gamesPlayed)
		? base.gamesPlayed
		: Array.isArray(base.gameHistory) ? base.gameHistory.length : 0;

	return {
		id: base.publicId || null,
		userId: user?.publicId || null,
		username: user?.username || null,
		name: buildDisplayName(user),
		score: base.score ?? 0,
		liveRating: base.liveRating ?? base.entryRating ?? user?.globalElo ?? 0,
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
		maxPlayers: base.maxPlayers ?? 100,
		participantCount: Array.isArray(base.participants) ? base.participants.length : 0,
	};
};

class TournamentService {
	filterSettings(settings = {}) {
		const allowed = ['name', 'tournLocation', 'startDate', 'endDate', 'timeControl', 'description', 'type', 'maxPlayers'];
		const filtered = {};
		for (const [key, value] of Object.entries(settings)) {
			if (value === undefined) continue;
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

		return filtered;
	}

	async getAllTournaments() {
		const tournaments = await Tournament.find().sort({ startDate: 1 });
		await ensureDocumentsPublicId(tournaments, Tournament);
		return tournaments.map(sanitizeTournamentSummary);
	}

	async createTournament(data) {
		const filtered = this.filterSettings(data);

		if (!filtered.name) throw makeError('Tournament name is required');
		if (!filtered.startDate || !filtered.endDate) {
			throw makeError('Tournament startDate and endDate are required');
		}

		const startDate = new Date(filtered.startDate);
		const endDate = new Date(filtered.endDate);
		if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
			throw makeError('Invalid startDate or endDate');
		}
		if (startDate > endDate) {
			throw makeError('startDate must be before endDate');
		}

		const tournament = new Tournament({
			...filtered,
			startDate,
			endDate,
			maxPlayers: filtered.maxPlayers ?? 100,
			tournStatus: 'upcoming',
		});

		await tournament.save();
		await ensureDocumentPublicId(tournament, Tournament);
		return sanitizeTournamentSummary(tournament);
	}

	async updateTournament(id, data) {
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

		if (filtered.startDate) {
			const parsedStart = new Date(filtered.startDate);
			if (Number.isNaN(parsedStart.getTime())) {
				throw makeError('Invalid startDate');
			}
			filtered.startDate = parsedStart;
		}
		if (filtered.endDate) {
			const parsedEnd = new Date(filtered.endDate);
			if (Number.isNaN(parsedEnd.getTime())) {
				throw makeError('Invalid endDate');
			}
			filtered.endDate = parsedEnd;
		}

		const startDate = filtered.startDate ?? tournament.startDate;
		const endDate = filtered.endDate ?? tournament.endDate;
		if (startDate && endDate && startDate > endDate) {
			throw makeError('startDate must be before endDate');
		}

		Object.assign(tournament, filtered);
		await tournament.save();
		await ensureDocumentPublicId(tournament, Tournament);
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
			.sort({ score: -1, liveRating: -1 });
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

		players.sort((a, b) => {
			const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
			if (scoreDiff !== 0) return scoreDiff;
			return (b.liveRating ?? 0) - (a.liveRating ?? 0);
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
				wins: summary?.wins ?? 0,
				draws: summary?.draws ?? 0,
				losses: summary?.losses ?? 0,
				entryRating: summary?.entryRating ?? 0,
				lastResultAt: summary?.lastResultAt ?? null,
			};
		});
	}

	async startTournament(id) {
		const tournament = await findByIdOrPublicId(Tournament, id);
		if (!tournament) throw makeError('Tournament not found', 404);
		if (tournament.tournStatus !== 'upcoming') {
			throw makeError('Tournament already started or completed');
		}

		tournament.tournStatus = 'in progress';
		await tournament.save();
		await ensureDocumentPublicId(tournament, Tournament);

		pairingService.startPairingLoop(String(tournament._id));
		return sanitizeTournamentSummary(tournament);
	}

	async endTournament(id) {
		const tournament = await findByIdOrPublicId(Tournament, id);
		if (!tournament) throw makeError('Tournament not found', 404);
		if (tournament.tournStatus !== 'in progress') {
			throw makeError('Tournament not in progress');
		}

		tournament.tournStatus = 'completed';
		await tournament.save();
		await ensureDocumentPublicId(tournament, Tournament);

		pairingService.stopPairingLoop(String(tournament._id));
		return sanitizeTournamentSummary(tournament);
	}

	async deleteTournament(id) {
		const tournament = await findByIdOrPublicId(Tournament, id);
		if (!tournament) throw makeError('Tournament not found', 404);
		if (tournament.tournStatus === 'in progress') {
			throw makeError('Cannot delete an in-progress tournament; end it first.');
		}

		await Promise.all([
			Player.deleteMany({ tournament: tournament._id }),
			Game.deleteMany({ tournament: tournament._id }),
		]);
		await tournament.deleteOne();
		return { message: 'Tournament deleted' };
	}

	async joinTournament(userId, tournamentId) {
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
			const activeCount = await Player.countDocuments({ tournament: tournamentId, status: { $nin: ['withdrawn'] } });
			if (activeCount >= tournament.maxPlayers) {
				throw makeError('Tournament is full');
			}
		}

		const exists = await Player.findOne({ user: user._id, tournament: tournament._id });
		if (exists) throw makeError('User already joined the tournament');

		const now = new Date();
		const seedRating = Number.isFinite(user.globalElo) ? Number(user.globalElo) : 0;
		const isActiveTournament = tournament.tournStatus === 'in progress';

		const player = new Player({
			user: user._id,
			tournament: tournament._id,
			isPlaying: false,
			waitingSince: isActiveTournament ? now : null,
			liveRating: seedRating,
			entryRating: seedRating,
			score: 0,
			gamesPlayed: 0,
			wins: 0,
			draws: 0,
			losses: 0,
			sumOpponentRatings: 0,
			status: 'active',
			enteredAt: now,
		});
		await player.save();

		tournament.participants = Array.isArray(tournament.participants)
			? [...tournament.participants, player._id]
			: [player._id];
		await tournament.save();

		if (isActiveTournament) {
			await enqueue(String(tournament._id), {
				_id: String(player._id),
				user: player.user,
				score: 0,
				liveRating: player.liveRating,
				entryRating: player.entryRating,
				recentOpponents: [],
				colorHistory: [],
				status: player.status,
				waitingSince: player.waitingSince,
				enqueuedAt: Date.now(),
			});
		}

		await ensureDocumentPublicId(player, Player);
		return summarizePlayer(await player.populate('user', 'publicId username email profile.firstName profile.lastName globalElo'));
	}

	async leaveTournament(userId, tournamentId) {
		const [tournament, user] = await Promise.all([
			findByIdOrPublicId(Tournament, tournamentId),
			findByIdOrPublicId(User, userId),
		]);
		if (!tournament) throw makeError('Tournament not found', 404);
		if (!user) throw makeError('User not found', 404);

		const player = await Player.findOne({ user: user._id, tournament: tournament._id });
		if (!player) throw makeError('Player not found in tournament', 404);
		if (player.isPlaying) {
			throw makeError('Player cannot leave while playing an active game');
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

		return {
			message: 'Player withdrawn from tournament successfully',
			player: summarizePlayer(player),
		};
	}

	async adminAddPlayerToTournament(userId, tournamentId) {
		return this.joinTournament(userId, tournamentId);
	}

	async adminRemovePlayerFromTournament(userId, tournamentId) {
		return this.leaveTournament(userId, tournamentId);
	}

	async pausePlayer(userId, tournamentId) {
		const [tournament, user] = await Promise.all([
			findByIdOrPublicId(Tournament, tournamentId),
			findByIdOrPublicId(User, userId),
		]);
		if (!tournament) throw makeError('Tournament not found', 404);
		if (!user) throw makeError('User not found', 404);
		const player = await Player.findOne({ user: user._id, tournament: tournament._id });
		if (!player) throw makeError('Player not found in tournament', 404);
		if (player.status === 'withdrawn') {
			throw makeError('Player already withdrawn from the tournament');
		}
		if (player.isPlaying) {
			throw makeError('Player cannot be paused while playing an active game');
		}

		player.status = 'paused';
		player.pausedAt = new Date();
		player.waitingSince = null;
		await player.save();

		await removePlayerEverywhere(String(tournament._id), player._id);
		await ensureDocumentPublicId(player, Player);
		await player.populate('user', 'publicId username email globalElo profile.firstName profile.lastName');
		if (player.user) await ensureDocumentPublicId(player.user, User);
		return summarizePlayer(player);
	}

	async resumePlayer(userId, tournamentId) {
		const [tournament, user] = await Promise.all([
			findByIdOrPublicId(Tournament, tournamentId),
			findByIdOrPublicId(User, userId),
		]);

		if (!tournament) throw makeError('Tournament not found', 404);
		if (!user) throw makeError('User not found', 404);

		const player = await Player.findOne({ user: user._id, tournament: tournament._id });
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
			await enqueue(String(tournament._id), {
				_id: String(player._id),
				user: player.user,
				score: player.score ?? 0,
				liveRating: player.liveRating ?? 0,
				entryRating: player.entryRating ?? 0,
				recentOpponents: (player.recentOpponents ?? []).map(String),
				colorHistory: player.colorHistory ?? [],
				status: player.status,
				waitingSince: player.waitingSince,
				enqueuedAt: Date.now(),
			});
		}

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
		const existingUserIds = new Set(existingPlayers.map((p) => p.user.toString()));

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
}

module.exports = new TournamentService();
