import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { tournamentAPI, userAPI, gameAPI } from '../services/api';
import { statusBadge, formatDate, getDisplayName } from '../utils/tournamentDisplay';
import CSVImport from '../components/CSVImport';
import './TournamentList.css';
import './TournamentManage.css';

const PLAYERS_CSV_TEMPLATE = `name,rating,identifier
John Doe,1500,john@example.com
Jane Smith,1600,
Guest Player,1400,`;

const TournamentManage = () => {
	const { id } = useParams();
	const navigate = useNavigate();

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [detail, setDetail] = useState(null);
	const [players, setPlayers] = useState([]);
	const [games, setGames] = useState([]);
	const [users, setUsers] = useState([]);
	const [usersError, setUsersError] = useState('');
	const [actionLoading, setActionLoading] = useState(false);
	const [actionError, setActionError] = useState('');
	const [addSelection, setAddSelection] = useState('');
	const [showCSVImport, setShowCSVImport] = useState(false);

	const tournamentId = id;

	const fetchUsers = useCallback(async () => {
		setUsersError('');
		try {
			const res = await userAPI.getAll();
			const list = res.data?.users || res.data || [];
			setUsers(Array.isArray(list) ? list : []);
		} catch (err) {
			setUsersError(err.message || 'Failed to load users');
		}
	}, []);

	const loadTournamentData = useCallback(async () => {
		if (!tournamentId) return;
		setError('');
		try {
			const [detailRes, playersRes, gamesRes] = await Promise.all([
				tournamentAPI.getTournament(tournamentId),
				tournamentAPI.getTournamentPlayers(tournamentId),
				tournamentAPI.getTournamentGames(tournamentId),
			]);
			setDetail(detailRes.data);
			setPlayers(Array.isArray(playersRes.data) ? playersRes.data : []);
			setGames(Array.isArray(gamesRes.data) ? gamesRes.data : []);
		} catch (err) {
			setError(err.message || 'Failed to load tournament data');
		}
	}, [tournamentId]);

	useEffect(() => {
		setLoading(true);
		Promise.all([loadTournamentData(), fetchUsers()]).finally(() => setLoading(false));
	}, [loadTournamentData, fetchUsers]);

	const handleAddSelectionChange = useCallback((event) => {
		setAddSelection(event.target.value);
	}, []);

	const withRefresh = useCallback(
		async (fn) => {
			setActionLoading(true);
			setActionError('');
			try {
				await fn();
				await loadTournamentData();
			} catch (err) {
				setActionError(err.message || 'Action failed');
			} finally {
				setActionLoading(false);
			}
		},
		[loadTournamentData]
	);

	const handleAddPlayer = useCallback(
		() =>
			withRefresh(async () => {
				if (!addSelection) return;
				await tournamentAPI.adminAddPlayer(tournamentId, addSelection);
				setAddSelection('');
			}),
		[withRefresh, addSelection, tournamentId]
	);

	const handlePausePlayer = useCallback(
		(userId) =>
			withRefresh(async () => {
				if (!userId) return;
				await tournamentAPI.pausePlayer(tournamentId, userId);
			}),
		[withRefresh, tournamentId]
	);

	const handleResumePlayer = useCallback(
		(userId) =>
			withRefresh(async () => {
				if (!userId) return;
				await tournamentAPI.resumePlayer(tournamentId, userId);
			}),
		[withRefresh, tournamentId]
	);

	const handleRemovePlayer = useCallback(
		(userId) =>
			withRefresh(async () => {
				if (!userId) return;
				await tournamentAPI.adminRemovePlayer(tournamentId, userId);
			}),
		[withRefresh, tournamentId]
	);

	const handleSubmitResult = useCallback(
		(gameId, result) =>
			withRefresh(async () => {
				await gameAPI.submitGameResult(gameId, result);
			}),
		[withRefresh]
	);

	const handleStart = useCallback(
		() => withRefresh(() => tournamentAPI.startTournament(tournamentId)),
		[withRefresh, tournamentId]
	);

	const handleEnd = useCallback(
		() => withRefresh(() => tournamentAPI.endTournament(tournamentId)),
		[withRefresh, tournamentId]
	);

	const handleDelete = useCallback(async () => {
		if (!window.confirm('Delete this tournament?')) return;
		setActionLoading(true);
		setActionError('');
		try {
			await tournamentAPI.deleteTournament(tournamentId);
			navigate('/tournaments');
		} catch (err) {
			setActionError(err.message || 'Failed to delete tournament');
			setActionLoading(false);
		}
	}, [navigate, tournamentId]);

	const handleCSVImport = useCallback(async (csvText) => {
		const res = await tournamentAPI.importPlayersCSV(tournamentId, csvText);
		// Refresh player list after import
		if (res.data?.added > 0) {
			await loadTournamentData();
		}
		return res.data;
	}, [tournamentId, loadTournamentData]);

	const derived = useMemo(() => {
		const activePlayers = players.filter((p) => (p.status || 'active') === 'active');
		const pausedPlayers = players.filter((p) => p.status === 'paused');
		const removablePlayers = players.filter((p) => p.status !== 'withdrawn');
		const activeGames = games.filter((g) => !g.isFinished);
		const stats = {
			total: players.length,
			active: activePlayers.length,
			paused: pausedPlayers.length,
			withdrawn: players.filter((p) => p.status === 'withdrawn').length,
		};
		return { activePlayers, pausedPlayers, removablePlayers, activeGames, stats };
	}, [players, games]);

	if (loading) {
		return (
			<div className="tournament-loading">
				<div className="tournament-loading-spinner" />
				<p>Loading tournament…</p>
			</div>
		);
	}

	if (error || !detail) {
		return (
			<div>
				<div className="alert alert-danger mb-3">{error || 'Tournament not found'}</div>
				<Link to="/tournaments" className="btn btn-primary">
					Back to Tournaments
				</Link>
			</div>
		);
	}

	const maxPlayers = detail.maxPlayers ?? detail.capacity;

	return (
		<div className="tournament-manage">
			<div className="container py-4 tournament-manage__container">
				<div className="tournament-manage__hero">
					<div className="tournament-manage__hero-main">
						<p className="tournament-manage__eyebrow">Tournament Control Center</p>
						<h1 className="tournament-manage__title">Manage Tournament</h1>
						<div className="tournament-manage__subtitle">
							<h2 className="tournament-manage__name">{detail.name || 'Untitled Tournament'}</h2>
							<div className="tournament-manage__status">{statusBadge(detail.tournStatus)}</div>
						</div>
						<p className="tournament-manage__meta">
							Starts {formatDate(detail.startDate)} · Ends {formatDate(detail.endDate)}
						</p>
					</div>
					<div className="tournament-manage__hero-actions">
						<Link to={`/tournament/${tournamentId}`} className="btn btn-outline-primary tournament-manage__hero-btn">
							View Public Page
						</Link>
						<Link to="/tournaments" className="btn btn-primary tournament-manage__hero-btn">
							Back to List
						</Link>
					</div>
				</div>

				{actionError && <div className="alert alert-danger tournament-manage__alert">{actionError}</div>}
				{usersError && (
					<div className="alert alert-warning tournament-manage__alert">
						Unable to load users for player management: {usersError}
					</div>
				)}

				<div className="row g-4 align-items-stretch tournament-manage__grid">
					<div className="col-lg-4">
						<div className="manage-section h-100 tournament-manage__panel">
							<h6 className="text-uppercase text-muted tournament-manage__section-title">Overview</h6>
							<ul className="list-unstyled mb-0 tournament-manage__overview">
								<li>
									<span>Status</span> {statusBadge(detail.tournStatus)}
								</li>
								<li>
									<span>Time Control</span> {detail.timeControl || '—'}
								</li>
								<li>
									<span>Location</span> {detail.tournLocation || '—'}
								</li>
								<li>
									<span>Schedule</span> {formatDate(detail.startDate)} → {formatDate(detail.endDate)}
								</li>
								<li>
									<span>Players</span> {derived.stats.active} active / {derived.stats.total} total
								</li>
								<li>
									<span>Capacity</span> {derived.stats.total} / {Number.isFinite(maxPlayers) ? maxPlayers : '∞'}
								</li>
							</ul>
						</div>
					</div>

					<div className="col-lg-8">
						<div className="manage-section h-100 tournament-manage__panel">
							<h6 className="text-uppercase text-muted tournament-manage__section-title">Player Controls</h6>

						<div className="tournament-manage__controls">
							<label className="form-label small">Add player</label>
								<div className="tournament-manage__add-control">
									<select
										className="form-select form-select-sm"
										value={addSelection}
										onChange={handleAddSelectionChange}
									>
										<option value="">Select user</option>
										{users
											.filter((user) => !players.some((p) => p.userId === user.id && p.status !== 'withdrawn'))
											.map((user) => (
												<option key={user.id} value={user.id}>
													{getDisplayName(user)}
												</option>
											))}
									</select>
									<button
									onClick={handleAddPlayer}
									className="btn btn-sm btn-primary"
									disabled={!addSelection || actionLoading}
								>
									Add
								</button>
							</div>
							<div className="mt-3">
								<button
									type="button"
									className={`btn btn-sm ${showCSVImport ? 'btn-secondary' : 'btn-outline-secondary'}`}
									onClick={() => setShowCSVImport(!showCSVImport)}
								>
									{showCSVImport ? 'Hide CSV Import' : 'Import Players from CSV'}
								</button>
							</div>
							{showCSVImport && (
								<div className="mt-3">
									<CSVImport
										type="players"
										onImport={handleCSVImport}
										templateContent={PLAYERS_CSV_TEMPLATE}
										templateFilename="players_template.csv"
									/>
								</div>
							)}
						</div>
					</div>{/* /.manage-section */}
					</div>{/* /.col-lg-8 */}
				</div>{/* /.row */}

				<hr className="tournament-manage__divider" />

				<h6 className="text-uppercase text-muted tournament-manage__section-title">Tournament Actions</h6>
				<div className="tournament-manage__actions d-flex flex-wrap gap-2 mb-4">
					<button
						className="btn btn-success tournament-manage__action-btn"
						onClick={handleStart}
						disabled={detail.tournStatus !== 'upcoming' || actionLoading}
					>
						Start Tournament
					</button>
					<button
						className="btn btn-warning tournament-manage__action-btn"
						onClick={handleEnd}
						disabled={detail.tournStatus !== 'in progress' || actionLoading}
					>
						End Tournament
					</button>
					<button
						className="btn btn-danger tournament-manage__action-btn"
						onClick={handleDelete}
						disabled={actionLoading}
					>
						Delete Tournament
					</button>
				</div>

				<div className="manage-section mt-3 tournament-manage__panel">
					<h6 className="text-uppercase text-muted tournament-manage__section-title">Participants</h6>
					{players.length === 0 ? (
						<p className="tournament-manage__empty">No participants registered.</p>
					) : (
						<ul className="tournament-manage__participants">
							{players.map((player) => {
								const statusRaw = (player.status || 'active').toLowerCase();
								const statusLabel = statusRaw.replace(/\b\w/g, (char) => char.toUpperCase());
								const userId = player.userId ?? player.id;

								return (
									<li key={player.id} className="tournament-manage__participant">
										<div className="tournament-manage__participant-meta">
											<span className="tournament-manage__participant-name">{player.name || player.username || 'Unknown player'}</span>
											<span className={`tournament-manage__participant-status tournament-manage__participant-status--${statusRaw.replace(/\s+/g, '-')}`}>
												{statusLabel}
											</span>
										</div>
										<div className="tournament-manage__participant-actions">
											{statusRaw === 'active' && (
												<>
													<button
														className="btn btn-sm btn-outline-warning"
														onClick={() => handlePausePlayer(userId)}
														disabled={actionLoading}
													>
														Pause
													</button>
													<button
														className="btn btn-sm btn-outline-danger"
														onClick={() => handleRemovePlayer(userId)}
														disabled={actionLoading}
													>
														Remove
													</button>
												</>
											)}
											{statusRaw === 'paused' && (
												<>
													<button
														className="btn btn-sm btn-outline-success"
														onClick={() => handleResumePlayer(userId)}
														disabled={actionLoading}
													>
														Resume
													</button>
													<button
														className="btn btn-sm btn-outline-danger"
														onClick={() => handleRemovePlayer(userId)}
														disabled={actionLoading}
													>
														Remove
													</button>
												</>
											)}
											{statusRaw !== 'active' && statusRaw !== 'paused' && (
												<span className="tournament-manage__participant-note">No actions available</span>
											)}
										</div>
									</li>
								);
							})}
						</ul>
					)}
				</div>

				<div className="manage-section mt-3 tournament-manage__panel">
					<h6 className="text-uppercase text-muted tournament-manage__section-title">Active Games</h6>
					{derived.activeGames.length === 0 ? (
						<p className="tournament-manage__empty">No active games at the moment.</p>
					) : (
							<div className="table-responsive">
								<table className="table table-sm align-middle tournament-manage__table">
									<thead>
										<tr>
											<th>White</th>
											<th>Black</th>
											<th className="text-end">Result</th>
										</tr>
									</thead>
									<tbody>
										{derived.activeGames.map((game) => (
											<tr key={game.id}>
												<td>{game.playerWhite?.name || game.playerWhite?.username || 'Unknown'}</td>
												<td>{game.playerBlack?.name || game.playerBlack?.username || 'Unknown'}</td>
												<td className="text-end">
													<div className="btn-group btn-group-sm tournament-manage__result-group" role="group">
														<button
															className="btn btn-outline-success"
															onClick={() => handleSubmitResult(game.id, 'white')}
															disabled={actionLoading}
														>
															White
														</button>
														<button
															className="btn btn-outline-dark"
															onClick={() => handleSubmitResult(game.id, 'black')}
															disabled={actionLoading}
														>
															Black
														</button>
														<button
															className="btn btn-outline-secondary"
															onClick={() => handleSubmitResult(game.id, 'draw')}
															disabled={actionLoading}
														>
															Draw
														</button>
													</div>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
				</div>
			</div>{/* /.container */}
		</div> // .tournament-manage
	);
};

export default TournamentManage;
