import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { tournamentAPI, userAPI, gameAPI } from '../services/api';
import './TournamentList.css';

const statusBadge = (status) => {
	switch (status) {
		case 'upcoming':
			return <span className="badge bg-warning text-dark">Upcoming</span>;
		case 'in progress':
			return <span className="badge bg-success">In Progress</span>;
		case 'completed':
			return <span className="badge bg-secondary">Completed</span>;
		default:
			return <span className="badge bg-primary">{status || 'Unknown'}</span>;
	}
};

const formatDate = (value) => {
	if (!value) return '—';
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
};

const summarizeDescription = (value) => {
	if (!value) return 'No description provided.';
	return value.length > 160 ? `${value.slice(0, 160)}…` : value;
};

const getDisplayName = (user = {}) => {
	const first = user?.profile?.firstName?.trim?.();
	const last = user?.profile?.lastName?.trim?.();
	const parts = [first, last].filter(Boolean);
	if (parts.length) return parts.join(' ');
	return user?.username || user?.email || 'Unknown';
};

const TournamentList = () => {
	const [tournaments, setTournaments] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [users, setUsers] = useState([]);
	const [usersError, setUsersError] = useState('');
	const [expandedId, setExpandedId] = useState(null);
	const [manageState, setManageState] = useState({});
	const [panelLoading, setPanelLoading] = useState({});
	const [panelError, setPanelError] = useState({});
	const [formSelections, setFormSelections] = useState({ add: {}, pause: {}, resume: {}, remove: {} });

	const updatePanelLoading = (id, value) => setPanelLoading((prev) => ({ ...prev, [id]: value }));
	const updatePanelError = (id, value) => setPanelError((prev) => ({ ...prev, [id]: value }));

	const loadTournaments = useCallback(async (silent = false) => {
		if (!silent) setLoading(true);
		setError('');
		try {
			const { data } = await tournamentAPI.getAllTournaments();
			setTournaments(Array.isArray(data) ? data : []);
		} catch (err) {
			if (err.status === 0) {
				setError('Cannot reach server. Please try again.');
			} else {
				setError(err.message || 'Failed to load tournaments');
			}
		} finally {
			if (!silent) setLoading(false);
		}
	}, []);

	const loadUsers = useCallback(async () => {
		setUsersError('');
		try {
			const res = await userAPI.getAll();
			const list = res.data?.users || res.data || [];
			setUsers(Array.isArray(list) ? list : []);
		} catch (err) {
			setUsersError(err.message || 'Failed to load users');
		}
	}, []);

	useEffect(() => {
		loadTournaments();
		loadUsers();
	}, [loadTournaments, loadUsers]);

	const refreshManageState = useCallback(async (id) => {
		if (!id) return;
		updatePanelLoading(id, true);
		updatePanelError(id, '');
		try {
			const [detailRes, playersRes, gamesRes] = await Promise.all([
				tournamentAPI.getTournament(id),
				tournamentAPI.getTournamentPlayers(id),
				tournamentAPI.getTournamentGames(id),
			]);
			setManageState((prev) => ({
				...prev,
				[id]: {
					detail: detailRes.data,
					players: Array.isArray(playersRes.data) ? playersRes.data : [],
					games: Array.isArray(gamesRes.data) ? gamesRes.data : [],
				},
			}));
		} catch (err) {
			updatePanelError(id, err.message || 'Failed to load tournament data');
		} finally {
			updatePanelLoading(id, false);
		}
	}, []);

	const toggleManage = async (id) => {
		if (expandedId === id) {
			setExpandedId(null);
			return;
		}
		setExpandedId(id);
		await refreshManageState(id);
	};

	const resetSelection = (type, id) =>
		setFormSelections((prev) => ({
			...prev,
			[type]: { ...prev[type], [id]: '' },
		}));

	const handleSelectionChange = (type, id) => (event) => {
		const value = event.target.value;
		setFormSelections((prev) => ({
			...prev,
			[type]: { ...prev[type], [id]: value },
		}));
	};

	const withPanelRefresh = async (id, fn) => {
		updatePanelLoading(id, true);
		updatePanelError(id, '');
		try {
			await fn();
			await Promise.all([refreshManageState(id), loadTournaments(true)]);
		} catch (err) {
			updatePanelError(id, err.message || 'Action failed');
		} finally {
			updatePanelLoading(id, false);
		}
	};

	const handleStart = (id) => withPanelRefresh(id, () => tournamentAPI.startTournament(id));
	const handleEnd = (id) => withPanelRefresh(id, () => tournamentAPI.endTournament(id));
	const handleDelete = async (id) => {
		if (!window.confirm('Delete this tournament?')) return;
		await withPanelRefresh(id, () => tournamentAPI.deleteTournament(id));
		setExpandedId(null);
	};

	const handleAddPlayer = (id) => withPanelRefresh(id, async () => {
		const userId = formSelections.add[id];
		if (!userId) return;
		await tournamentAPI.adminAddPlayer(id, userId);
		resetSelection('add', id);
	});

	const handlePausePlayer = (id) => withPanelRefresh(id, async () => {
		const userId = formSelections.pause[id];
		if (!userId) return;
		await tournamentAPI.pausePlayer(id, userId);
		resetSelection('pause', id);
	});

	const handleResumePlayer = (id) => withPanelRefresh(id, async () => {
		const userId = formSelections.resume[id];
		if (!userId) return;
		await tournamentAPI.resumePlayer(id, userId);
		resetSelection('resume', id);
	});

	const handleRemovePlayer = (id) => withPanelRefresh(id, async () => {
		const userId = formSelections.remove[id];
		if (!userId) return;
		await tournamentAPI.adminRemovePlayer(id, userId);
		resetSelection('remove', id);
	});

	const handleSubmitResult = (tournamentId, gameId, result) => {
		return withPanelRefresh(tournamentId, async () => {
			await gameAPI.submitGameResult(gameId, result);
		});
	};

	const renderManagePanel = (tournament) => {
		const panel = manageState[tournament.id] || {};
		const players = panel.players || [];
		const games = panel.games || [];
		const detail = panel.detail || tournament;
		const activePlayers = players.filter((p) => (p.status || 'active') === 'active');
		const pausedPlayers = players.filter((p) => p.status === 'paused');
		const removablePlayers = players.filter((p) => p.status !== 'withdrawn');
		const activeGames = games.filter((g) => !g.isFinished);

		const addSelection = formSelections.add[tournament.id] || '';
		const pauseSelection = formSelections.pause[tournament.id] || '';
		const resumeSelection = formSelections.resume[tournament.id] || '';
		const removeSelection = formSelections.remove[tournament.id] || '';

		const maxPlayers = detail.maxPlayers ?? tournament.maxPlayers;
		const summaryStats = {
			total: players.length,
			active: activePlayers.length,
			paused: pausedPlayers.length,
			withdrawn: players.filter((p) => p.status === 'withdrawn').length,
		};

		return (
			<div className="manage-panel mt-3">
				{panelError[tournament.id] && (
					<div className="alert alert-danger mb-3">{panelError[tournament.id]}</div>
				)}
				<div className="row g-3 align-items-stretch">
					<div className="col-lg-4">
						<div className="manage-section h-100">
							<h6 className="text-uppercase text-muted">Overview</h6>
							<ul className="list-unstyled mb-0">
								<li><strong>Status:</strong> {statusBadge(detail.tournStatus)}</li>
								<li><strong>Time Control:</strong> {detail.timeControl || '—'}</li>
								<li><strong>Location:</strong> {detail.tournLocation || '—'}</li>
								<li><strong>Schedule:</strong> {formatDate(detail.startDate)} → {formatDate(detail.endDate)}</li>
								<li><strong>Players:</strong> {summaryStats.active} active / {summaryStats.total} total</li>
								<li><strong>Capacity:</strong> {summaryStats.total} / {Number.isFinite(maxPlayers) ? maxPlayers : '∞'}</li>
							</ul>
						</div>
					</div>
					<div className="col-lg-8">
						<div className="manage-section h-100">
							<h6 className="text-uppercase text-muted">Player Controls</h6>
							<div className="row g-2">
								<div className="col-sm-6">
									<label className="form-label small text-muted">Add player</label>
									<div className="d-flex gap-2">
										<select
											className="form-select form-select-sm"
											value={addSelection}
											onChange={handleSelectionChange('add', tournament.id)}
										>
											<option value="">Select user</option>
											{users
												.filter((user) => !players.some((p) => p.userId === user.id && p.status !== 'withdrawn'))
											.map((user) => (
												<option key={user.id} value={user.id}>{getDisplayName(user)}</option>
											))}
										</select>
										<button
											onClick={() => handleAddPlayer(tournament.id)}
											className="btn btn-sm btn-primary"
											disabled={!addSelection || panelLoading[tournament.id]}
										>
											Add
										</button>
									</div>
								</div>
								<div className="col-sm-6">
									<label className="form-label small text-muted">Pause player</label>
									<div className="d-flex gap-2">
										<select
											className="form-select form-select-sm"
											value={pauseSelection}
											onChange={handleSelectionChange('pause', tournament.id)}
										>
											<option value="">Select active player</option>
											{activePlayers.map((player) => (
												<option key={player.id} value={player.userId}>{player.name || player.username}</option>
											))}
										</select>
										<button
											onClick={() => handlePausePlayer(tournament.id)}
											className="btn btn-sm btn-outline-warning"
											disabled={!pauseSelection || panelLoading[tournament.id]}
										>
											Pause
										</button>
									</div>
								</div>
								<div className="col-sm-6">
									<label className="form-label small text-muted">Resume player</label>
									<div className="d-flex gap-2">
										<select
											className="form-select form-select-sm"
											value={resumeSelection}
											onChange={handleSelectionChange('resume', tournament.id)}
										>
											<option value="">Select paused player</option>
											{pausedPlayers.map((player) => (
												<option key={player.id} value={player.userId}>{player.name || player.username}</option>
											))}
										</select>
										<button
											onClick={() => handleResumePlayer(tournament.id)}
											className="btn btn-sm btn-outline-success"
											disabled={!resumeSelection || panelLoading[tournament.id]}
										>
											Resume
										</button>
									</div>
								</div>
								<div className="col-sm-6">
									<label className="form-label small text-muted">Remove player</label>
									<div className="d-flex gap-2">
										<select
											className="form-select form-select-sm"
											value={removeSelection}
											onChange={handleSelectionChange('remove', tournament.id)}
										>
											<option value="">Select player</option>
											{removablePlayers.map((player) => (
												<option key={player.id} value={player.userId}>{player.name || player.username}</option>
											))}
										</select>
										<button
											onClick={() => handleRemovePlayer(tournament.id)}
											className="btn btn-sm btn-outline-danger"
											disabled={!removeSelection || panelLoading[tournament.id]}
										>
											Remove
										</button>
									</div>
								</div>
							</div>

							<hr className="my-3" />
							<h6 className="text-uppercase text-muted">Tournament Actions</h6>
							<div className="d-flex flex-wrap gap-2">
								<button
									className="btn btn-sm btn-success"
									onClick={() => handleStart(tournament.id)}
									disabled={detail.tournStatus !== 'upcoming' || panelLoading[tournament.id]}
								>
									Start Tournament
								</button>
								<button
									className="btn btn-sm btn-warning"
									onClick={() => handleEnd(tournament.id)}
									disabled={detail.tournStatus !== 'in progress' || panelLoading[tournament.id]}
								>
									End Tournament
								</button>
								<button
									className="btn btn-sm btn-outline-danger"
									onClick={() => handleDelete(tournament.id)}
									disabled={panelLoading[tournament.id]}
								>
									Delete
								</button>
							</div>
						</div>
					</div>
				</div>

				<div className="manage-section mt-3">
					<h6 className="text-uppercase text-muted">Participants</h6>
					<div className="table-responsive">
						<table className="table table-sm align-middle">
							<thead>
								<tr>
									<th>Name</th>
									<th>Status</th>
									<th>Score</th>
									<th>Games</th>
									<th>Live Rating</th>
									<th className="text-center">W</th>
									<th className="text-center">D</th>
									<th className="text-center">L</th>
								</tr>
							</thead>
							<tbody>
								{players.length === 0 ? (
									<tr>
										<td colSpan="8" className="text-center text-muted">No participants registered.</td>
									</tr>
								) : (
									players.map((player) => (
										<tr key={player.id}>
											<td>{player.name || player.username}</td>
											<td>{(player.status || 'active').replace(/\b\w/g, (char) => char.toUpperCase())}</td>
											<td>{Number.isFinite(player.score) ? player.score : 0}</td>
											<td>{player.gamesPlayed ?? player.games ?? 0}</td>
											<td>{Number.isFinite(player.liveRating) ? Math.round(player.liveRating) : '—'}</td>
											<td className="text-center">{player.wins ?? 0}</td>
											<td className="text-center">{player.draws ?? 0}</td>
											<td className="text-center">{player.losses ?? 0}</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				</div>

				<div className="manage-section mt-3">
					<h6 className="text-uppercase text-muted">Active Games</h6>
					{activeGames.length === 0 ? (
						<p className="text-muted mb-0">No active games at the moment.</p>
					) : (
						<div className="table-responsive">
							<table className="table table-sm align-middle">
								<thead>
									<tr>
										<th>White</th>
										<th>Black</th>
										<th className="text-end">Result</th>
									</tr>
								</thead>
								<tbody>
									{activeGames.map((game) => (
										<tr key={game.id}>
											<td>{game.playerWhite?.name || game.playerWhite?.username || 'Unknown'}</td>
											<td>{game.playerBlack?.name || game.playerBlack?.username || 'Unknown'}</td>
											<td className="text-end">
												<div className="btn-group btn-group-sm" role="group">
													<button className="btn btn-outline-success" onClick={() => handleSubmitResult(tournament.id, game.id, 'white')} disabled={panelLoading[tournament.id]}>White</button>
													<button className="btn btn-outline-dark" onClick={() => handleSubmitResult(tournament.id, game.id, 'black')} disabled={panelLoading[tournament.id]}>Black</button>
													<button className="btn btn-outline-secondary" onClick={() => handleSubmitResult(tournament.id, game.id, 'draw')} disabled={panelLoading[tournament.id]}>Draw</button>
												</div>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			</div>
		);
	};

	const renderTournamentCards = () => {
		if (tournaments.length === 0) {
			return (
				<div className="card">
					<div className="card-body text-center">
						<p className="text-muted mb-3">No tournaments available at the moment.</p>
						<Link to="/admin/tournaments/new" className="btn btn-primary">Create your first tournament</Link>
					</div>
				</div>
			);
		}

		return (
			<div className="tournament-grid">
				{tournaments.map((tournament) => (
					<div key={tournament.id || tournament.name} className="card shadow-sm tournament-card">
						<div className="card-header d-flex justify-content-between align-items-center">
							<h3 className="card-title mb-0">{tournament.name || 'Untitled Tournament'}</h3>
							{statusBadge(tournament.tournStatus)}
						</div>
						<div className="card-body">
							<p className="mb-2 text-muted">{summarizeDescription(tournament.description)}</p>
							<div className="row small text-muted">
								<div className="col-6">
									<p className="mb-1"><strong>Location:</strong> {tournament.tournLocation || '—'}</p>
									<p className="mb-1"><strong>Time Control:</strong> {tournament.timeControl || '—'}</p>
								</div>
								<div className="col-6">
									<p className="mb-1"><strong>Starts:</strong> {formatDate(tournament.startDate)}</p>
									<p className="mb-1"><strong>Players:</strong> {tournament.participantCount} / {Number.isFinite(tournament.maxPlayers) ? tournament.maxPlayers : '∞'}</p>
								</div>
							</div>
						</div>
						<div className="card-footer bg-transparent">
							<div className="row g-2">
								<div className="col-12 col-sm-6 col-md-4">
									<Link to={`/tournament/${tournament.id}`} className="btn btn-outline-primary w-100">
										View Details
									</Link>
								</div>
								<div className="col-12 col-sm-6 col-md-4">
									<button
										onClick={() => toggleManage(tournament.id)}
										className="btn btn-primary w-100"
									>
										{expandedId === tournament.id ? 'Hide Management' : 'Manage Tournament'}
									</button>
								</div>
								<div className="col-12 col-sm-6 col-md-4">
									<button
										onClick={() => handleDelete(tournament.id)}
										className="btn btn-danger w-100"
										disabled={panelLoading[tournament.id]}
									>
										Delete Tournament
									</button>
								</div>
							</div>
							{expandedId === tournament.id && (
								<div className="position-relative">
									{panelLoading[tournament.id] && (
										<div className="manage-overlay d-flex align-items-center justify-content-center">
											<div className="spinner-border" role="status" />
										</div>
									)}
									{renderManagePanel(tournament)}
								</div>
							)}
						</div>
					</div>
				))}
			</div>
		);
	};

	if (loading) {
		return (
			<div className="tournament-loading">
				<div className="tournament-loading-spinner" />
				<p>Loading tournaments...</p>
			</div>
		);
	}

	if (error) {
		return <div className="alert alert-danger">{error}</div>;
	}

	return (
		<div>
			<div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-4">
				<h1 className="m-0">Tournaments</h1>
				<div className="d-flex gap-2 flex-wrap">
					<button className="btn btn-outline-secondary" onClick={() => loadTournaments(false)}>Refresh</button>
					<Link to="/admin/tournaments/new" className="btn btn-primary">Create Tournament</Link>
				</div>
			</div>

			{usersError && (
				<div className="alert alert-warning">
					Unable to load users for player management: {usersError}
				</div>
			)}

			{renderTournamentCards()}
		</div>
	);
};

export default TournamentList;
