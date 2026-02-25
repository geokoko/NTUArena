import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { tournamentAPI, gameAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import './TournamentDetail.css';

const PLAYERS_PER_PAGE = 15;
const AUTO_REFRESH_MS = 1000;

const TournamentDetail = () => {
	const { id } = useParams();
	const { user, isAdmin } = useAuth();
	const [tournament, setTournament] = useState(null);
	const [standings, setStandings] = useState([]);
	const [games, setGames] = useState([]);
	const [players, setPlayers] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [activeTab, setActiveTab] = useState('overview');
	const [currentPage, setCurrentPage] = useState(1);
	const [autoRefresh, setAutoRefresh] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [lastUpdated, setLastUpdated] = useState(null);
	const [actionLoading, setActionLoading] = useState(false);
	const [actionError, setActionError] = useState('');
	const [submittingGameId, setSubmittingGameId] = useState(null);
	const [selectedHistoryPlayerId, setSelectedHistoryPlayerId] = useState('');

	const loadTournamentDetails = useCallback(async () => {
		try {
			const [tournamentRes, standingsRes, gamesRes, playersRes] = await Promise.all([
				tournamentAPI.getTournament(id),
				tournamentAPI.getTournamentStandings(id),
				tournamentAPI.getTournamentGames(id),
				tournamentAPI.getTournamentPlayers(id),
			]);

			setTournament(tournamentRes.data);
			setStandings(Array.isArray(standingsRes.data) ? standingsRes.data : []);
			setGames(Array.isArray(gamesRes.data) ? gamesRes.data : []);
			setPlayers(Array.isArray(playersRes.data) ? playersRes.data : []);
			setLastUpdated(new Date());
		} catch (err) {
			if (err.status === 404) {
				setError('Tournament not found');
			} else if (err.status === 0) {
				setError('Cannot reach server. Please try again.');
			} else {
				setError(err.message || 'Failed to load tournament details');
			}
			console.error('Load tournament details error:', err);
		} finally {
			setLoading(false);
		}
	}, [id]);

	const refreshGames = useCallback(async () => {
		if (!id) return;
		setRefreshing(true);
		try {
			const { data } = await tournamentAPI.getTournamentGames(id);
			setGames(Array.isArray(data) ? data : []);
			setLastUpdated(new Date());
		} catch (err) {
			console.error('Refresh games error:', err);
		} finally {
			setRefreshing(false);
		}
	}, [id]);

	const refreshPlayers = useCallback(async () => {
		if (!id) return;
		try {
			const { data } = await tournamentAPI.getTournamentPlayers(id);
			setPlayers(Array.isArray(data) ? data : []);
		} catch (err) {
			console.error('Refresh players error:', err);
		}
	}, [id]);

	const refreshStandings = useCallback(async () => {
		if (!id) return;
		try {
			const { data } = await tournamentAPI.getTournamentStandings(id);
			setStandings(Array.isArray(data) ? data : []);
		} catch (err) {
			console.error('Refresh standings error:', err);
		}
	}, [id]);

	useEffect(() => {
		setLoading(true);
		setError('');
		loadTournamentDetails();
	}, [loadTournamentDetails]);

	useEffect(() => {
		if (!autoRefresh || activeTab !== 'active-games') return;
		const timer = setInterval(() => {
			refreshGames();
		}, AUTO_REFRESH_MS);
		return () => clearInterval(timer);
	}, [autoRefresh, activeTab, refreshGames]);

	useEffect(() => {
		setCurrentPage(1);
	}, [activeTab]);

	useEffect(() => {
		if (!players.length) return;
		setSelectedHistoryPlayerId((current) => {
			if (current) return current;
			const self = user ? players.find((p) => p.userId === user.id) : null;
			return self ? self.id : 'all';
		});
	}, [players, user]);

	const paginatedStandings = useMemo(() => {
		const startIndex = (currentPage - 1) * PLAYERS_PER_PAGE;
		return standings.slice(startIndex, startIndex + PLAYERS_PER_PAGE);
	}, [standings, currentPage]);

	const totalPages = Math.ceil(standings.length / PLAYERS_PER_PAGE);

	const getStatusBadge = (status) => {
		switch (status) {
			case 'upcoming':
				return <span className="badge badge-warning">Upcoming</span>;
			case 'in progress':
				return <span className="badge badge-success">In Progress</span>;
			case 'completed':
				return <span className="badge badge-secondary">Completed</span>;
			default:
				return <span className="badge badge-primary">{status}</span>;
		}
	};

	const getGameResultDisplay = (game) => {
		if (!game.isFinished) return <span className="badge badge-warning">Ongoing</span>;
		if (!game.resultColor) return <span className="badge badge-secondary">Cancelled</span>;
		if (game.resultColor === 'white') return <span className="badge badge-success">1-0</span>;
		if (game.resultColor === 'black') return <span className="badge badge-success">0-1</span>;
		return <span className="badge badge-secondary">½-½</span>;
	};

	const getRankClass = (rank) => {
		if (rank === 1) return 'rank-gold';
		if (rank === 2) return 'rank-silver';
		if (rank === 3) return 'rank-bronze';
		return '';
	};

	const getRankIcon = (rank) => {
		if (rank === 1) return '🥇';
		if (rank === 2) return '🥈';
		if (rank === 3) return '🥉';
		return rank;
	};

	const getStreakIndicator = (standing) => {
		const winRate = standing.games > 0 ? standing.wins / standing.games : 0;
		if (standing.wins >= 3 && winRate >= 0.7) {
			return <span className="streak-fire" title="On fire!">🔥</span>;
		}
		return null;
	};

	const formatDateTime = (value) => {
		if (!value) return '—';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '—';
		return date.toLocaleString();
	};

	const activeGames = useMemo(() => games.filter((g) => !g.isFinished), [games]);
	const completedGames = useMemo(() => games.filter((g) => g.isFinished), [games]);

	const historyPlayers = useMemo(() => {
		return players
			.map((p) => ({
				id: p.id,
				name: p.name || p.username || 'Unknown player',
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [players]);

	const historyGames = useMemo(() => {
		if (!selectedHistoryPlayerId || selectedHistoryPlayerId === 'all') {
			return completedGames;
		}
		return completedGames.filter((game) =>
			game.playerWhite?.id === selectedHistoryPlayerId || game.playerBlack?.id === selectedHistoryPlayerId
		);
	}, [completedGames, selectedHistoryPlayerId]);

	const withAdminAction = useCallback(async (fn) => {
		setActionLoading(true);
		setActionError('');
		try {
			await fn();
			await Promise.all([refreshPlayers(), refreshGames(), refreshStandings()]);
		} catch (err) {
			setActionError(err.message || 'Action failed');
		} finally {
			setActionLoading(false);
		}
	}, [refreshPlayers, refreshGames, refreshStandings]);

	const handlePausePlayer = useCallback((userId) =>
		withAdminAction(async () => {
			if (!userId) return;
			await tournamentAPI.pausePlayer(id, userId);
		}), [withAdminAction, id]);

	const handleResumePlayer = useCallback((userId) =>
		withAdminAction(async () => {
			if (!userId) return;
			await tournamentAPI.resumePlayer(id, userId);
		}), [withAdminAction, id]);

	const handleRemovePlayer = useCallback((userId) =>
		withAdminAction(async () => {
			if (!userId) return;
			await tournamentAPI.adminRemovePlayer(id, userId);
		}), [withAdminAction, id]);

	const handleSubmitResult = useCallback(async (gameId, result) => {
		if (!gameId) return;
		setSubmittingGameId(gameId);
		try {
			await gameAPI.submitGameResult(gameId, result);
			await Promise.all([refreshGames(), refreshStandings(), refreshPlayers()]);
		} catch (err) {
			alert(err.message || 'Failed to submit result');
		} finally {
			setSubmittingGameId(null);
		}
	}, [refreshGames, refreshStandings, refreshPlayers]);

	if (loading) {
		return (
			<div className="text-center">
				<div className="loading-spinner"></div>
				<p>Loading tournament details...</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className="alert alert-danger">
				{error}
			</div>
		);
	}

	if (!tournament) {
		return (
			<div className="alert alert-info">
				Tournament not found
			</div>
		);
	}

	return (
		<div className="tournament-detail">
			<div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
				<div>
					<h1>{tournament.name}</h1>
					{getStatusBadge(tournament.tournStatus)}
				</div>
				<Link to="/tournaments" className="btn btn-secondary">
					Back to Tournaments
				</Link>
			</div>

			<div className="tournament-tabs mb-4">
				<div className="d-flex gap-2 flex-wrap">
					<button
						onClick={() => setActiveTab('overview')}
						className={`btn ${activeTab === 'overview' ? 'btn-primary' : 'btn-secondary'}`}
					>
						Overview
					</button>
					<button
						onClick={() => setActiveTab('standings')}
						className={`btn ${activeTab === 'standings' ? 'btn-primary' : 'btn-secondary'}`}
					>
						Standings
					</button>
					<button
						onClick={() => setActiveTab('active-games')}
						className={`btn ${activeTab === 'active-games' ? 'btn-primary' : 'btn-secondary'}`}
					>
						Active Games
					</button>
					<button
						onClick={() => setActiveTab('history')}
						className={`btn ${activeTab === 'history' ? 'btn-primary' : 'btn-secondary'}`}
					>
						Game History
					</button>
					{isAdmin && (
						<button
							onClick={() => setActiveTab('manage')}
							className={`btn ${activeTab === 'manage' ? 'btn-primary' : 'btn-secondary'}`}
						>
							Manage
						</button>
					)}
				</div>
			</div>

			{activeTab === 'overview' && (
				<div className="overview-content">
					<div className="card mb-4 tournament-info-card">
						<div className="card-header">
							<h3 className="card-title">Tournament Information</h3>
						</div>
						<div className="tournament-info-grid">
							<div className="info-item">
								<span className="info-label">Location</span>
								<span className="info-value">{tournament.tournLocation || '—'}</span>
							</div>
							<div className="info-item">
								<span className="info-label">Time Control</span>
								<span className="info-value">{tournament.timeControl || '—'}</span>
							</div>
							<div className="info-item">
								<span className="info-label">Max Players</span>
								<span className="info-value">{tournament.maxPlayers || '∞'}</span>
							</div>
							<div className="info-item">
								<span className="info-label">Start Date</span>
								<span className="info-value">{formatDateTime(tournament.startDate)}</span>
							</div>
							<div className="info-item">
								<span className="info-label">End Date</span>
								<span className="info-value">{formatDateTime(tournament.endDate)}</span>
							</div>
							<div className="info-item">
								<span className="info-label">Current Players</span>
								<span className="info-value">{tournament.participants?.length || players.length}</span>
							</div>
						</div>
					</div>

					<div className="card">
						<div className="card-header">
							<h3 className="card-title">Tournament Overview</h3>
						</div>
						<div className="overview-body">
							{tournament.description && (
								<p className="tournament-description">{tournament.description}</p>
							)}
							<div className="quick-stats">
								<h4>Quick Stats</h4>
								<div className="stats-grid">
									<div className="stat-item">
										<span className="stat-value">{games.length}</span>
										<span className="stat-label">Total Games</span>
									</div>
									<div className="stat-item">
										<span className="stat-value">{completedGames.length}</span>
										<span className="stat-label">Completed</span>
									</div>
									<div className="stat-item">
										<span className="stat-value">{activeGames.length}</span>
										<span className="stat-label">Ongoing</span>
									</div>
									<div className="stat-item">
										<span className="stat-value">{players.filter((p) => (p.status || 'active') === 'active').length}</span>
										<span className="stat-label">Active Players</span>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			)}

			{activeTab === 'standings' && (
				<div className="standings-content">
					<div className="lichess-standings">
						<div className="standings-header">
							<h3>Leaderboard</h3>
							<span className="standings-count">{standings.length} players</span>
						</div>

						{standings.length === 0 ? (
							<div className="standings-empty">
								<p>No standings available yet.</p>
							</div>
						) : (
							<>
								<div className="standings-table-wrapper">
									<table className="standings-table">
										<thead>
											<tr>
												<th className="col-rank">#</th>
												<th className="col-player">Player</th>
												<th className="col-score">Score</th>
												<th className="col-games">Games</th>
												<th className="col-rating">Rating</th>
												<th className="col-performance">Perf</th>
												<th className="col-wdl">W/D/L</th>
											</tr>
										</thead>
										<tbody>
											{paginatedStandings.map((standing) => (
												<tr key={standing.player.id} className={`standing-row ${getRankClass(standing.rank)}`}>
													<td className="col-rank">
														<span className="rank-badge">{getRankIcon(standing.rank)}</span>
													</td>
													<td className="col-player">
														<div className="player-info">
															<span className="player-name">
																{standing.player.name || standing.player.username}
																{getStreakIndicator(standing)}
															</span>
														</div>
													</td>
													<td className="col-score">
														<span className="score-badge">{standing.score}</span>
													</td>
													<td className="col-games">{standing.games}</td>
													<td className="col-rating">
														<span className="rating-value">{standing.liveRating}</span>
													</td>
													<td className="col-performance">
														{standing.performanceRating || '—'}
													</td>
													<td className="col-wdl">
														<span className="wdl-display">
															<span className="win">{standing.wins ?? 0}</span>
															<span className="draw">{standing.draws ?? 0}</span>
															<span className="loss">{standing.losses ?? 0}</span>
														</span>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>

								{totalPages > 1 && (
									<div className="standings-pagination">
										<button
											className="pagination-btn"
											onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
											disabled={currentPage === 1}
										>
											← Previous
										</button>

										<div className="pagination-pages">
											{Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
												const showPage = page === 1 ||
													page === totalPages ||
													Math.abs(page - currentPage) <= 1;
												const showEllipsis = (page === 2 && currentPage > 3) ||
													(page === totalPages - 1 && currentPage < totalPages - 2);

												if (showEllipsis && !showPage) {
													return <span key={page} className="pagination-ellipsis">…</span>;
												}

												if (!showPage && !showEllipsis) return null;

												return (
													<button
														key={page}
														className={`pagination-page ${currentPage === page ? 'active' : ''}`}
														onClick={() => setCurrentPage(page)}
													>
														{page}
													</button>
												);
											})}
										</div>

										<button
											className="pagination-btn"
											onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
											disabled={currentPage === totalPages}
										>
											Next →
										</button>
									</div>
								)}
							</>
						)}
					</div>
				</div>
			)}

			{activeTab === 'active-games' && (
				<div className="card tournament-active">
					<div className="card-header tournament-active__header">
						<div>
							<h3 className="card-title">Active Games</h3>
							<p className="tournament-active__subtitle">Live pairings update every second when auto refresh is on.</p>
						</div>
						<div className="tournament-active__controls">
							<div className="form-check form-switch">
								<input
									id="active-auto-refresh"
									type="checkbox"
									className="form-check-input"
									checked={autoRefresh}
									onChange={(e) => setAutoRefresh(e.target.checked)}
								/>
								<label className="form-check-label" htmlFor="active-auto-refresh">Auto refresh (1s)</label>
							</div>
							<button
								className="btn btn-outline-secondary btn-sm"
								onClick={refreshGames}
								disabled={refreshing}
							>
								{refreshing ? 'Refreshing…' : 'Refresh now'}
							</button>
						</div>
					</div>
					{lastUpdated && (
						<div className="tournament-active__timestamp">
							Updated {formatDateTime(lastUpdated)}
						</div>
					)}
					{activeGames.length === 0 ? (
						<p className="text-muted text-center">No active games at the moment.</p>
					) : (
						<div className="table-responsive">
							<table className="table table-sm align-middle tournament-active__table">
								<thead>
									<tr>
										<th>White</th>
										<th>Black</th>
										<th>Started</th>
										<th>Status</th>
										{isAdmin && <th className="text-end">Set Result</th>}
									</tr>
								</thead>
								<tbody>
									{activeGames.map((game) => (
										<tr key={game.id}>
											<td>{game.playerWhite?.name || game.playerWhite?.username || 'Unknown'}</td>
											<td>{game.playerBlack?.name || game.playerBlack?.username || 'Unknown'}</td>
											<td>{formatDateTime(game.startedAt)}</td>
											<td>{getGameResultDisplay(game)}</td>
								{isAdmin && (
									<td className="text-end">
										<div className="tournament-active__result-buttons">
											<button
												className="btn btn-sm btn-success tournament-active__result-btn tournament-active__result-btn--white"
												onClick={() => handleSubmitResult(game.id, 'white')}
												disabled={!!submittingGameId}
											>
												White wins
											</button>
											<button
												className="btn btn-sm btn-dark tournament-active__result-btn tournament-active__result-btn--black"
												onClick={() => handleSubmitResult(game.id, 'black')}
												disabled={!!submittingGameId}
											>
												Black wins
											</button>
											<button
												className="btn btn-sm btn-secondary tournament-active__result-btn tournament-active__result-btn--draw"
												onClick={() => handleSubmitResult(game.id, 'draw')}
												disabled={!!submittingGameId}
											>
												Draw
											</button>
										</div>
												</td>
											)}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			)}

			{activeTab === 'history' && (
				<div className="card tournament-history">
					<div className="card-header tournament-history__header">
						<h3 className="card-title">Game History</h3>
						<div className="tournament-history__controls">
							<label className="form-label small mb-1" htmlFor="history-player">Show games for</label>
							<select
								id="history-player"
								className="form-select form-select-sm"
								value={selectedHistoryPlayerId || 'all'}
								onChange={(e) => setSelectedHistoryPlayerId(e.target.value)}
							>
								<option value="all">All players</option>
								{historyPlayers.map((player) => (
									<option key={player.id} value={player.id}>
										{player.name}
									</option>
								))}
							</select>
						</div>
					</div>
					{historyGames.length === 0 ? (
						<p className="text-muted text-center">No completed games yet.</p>
					) : (
						<div className="table-responsive">
							<table className="table table-sm align-middle tournament-history__table">
								<thead>
									<tr>
										<th>White</th>
										<th>Black</th>
										<th>Result</th>
										<th>Finished</th>
									</tr>
								</thead>
								<tbody>
									{historyGames.map((game) => (
										<tr key={game.id}>
											<td>{game.playerWhite?.name || game.playerWhite?.username || 'Unknown'}</td>
											<td>{game.playerBlack?.name || game.playerBlack?.username || 'Unknown'}</td>
											<td>{getGameResultDisplay(game)}</td>
											<td>{formatDateTime(game.finishedAt)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			)}

			{isAdmin && activeTab === 'manage' && (
				<div className="card tournament-admin">
					<div className="card-header">
						<h3 className="card-title">Manage Participants</h3>
					</div>
					{actionError && <div className="alert alert-danger mb-3">{actionError}</div>}
					{players.length === 0 ? (
						<p className="text-muted text-center">No participants registered.</p>
					) : (
						<div className="table-responsive">
							<table className="table table-sm align-middle tournament-admin__table">
								<thead>
									<tr>
										<th>Player</th>
										<th>Status</th>
										<th className="text-end">Actions</th>
									</tr>
								</thead>
								<tbody>
									{players.map((player) => {
										const statusRaw = (player.status || 'active').toLowerCase();
										const statusLabel = statusRaw.replace(/\b\w/g, (char) => char.toUpperCase());
										const userId = player.userId ?? player.id;

										return (
											<tr key={player.id}>
												<td>{player.name || player.username || 'Unknown player'}</td>
												<td>
													<span className={`tournament-admin__status tournament-admin__status--${statusRaw}`}>
														{statusLabel}
													</span>
												</td>
												<td className="text-end">
													<div className="tournament-admin__actions">
										{statusRaw === 'active' && (
											<button
												className="btn btn-sm btn-outline-warning tournament-admin__action-btn tournament-admin__action-btn--pause"
												onClick={() => handlePausePlayer(userId)}
												disabled={actionLoading}
											>
												Pause
															</button>
														)}
										{statusRaw === 'paused' && (
											<button
												className="btn btn-sm btn-outline-success tournament-admin__action-btn tournament-admin__action-btn--resume"
												onClick={() => handleResumePlayer(userId)}
												disabled={actionLoading}
											>
												Resume
															</button>
														)}
										{statusRaw !== 'withdrawn' && (
											<button
												className="btn btn-sm btn-outline-danger tournament-admin__action-btn tournament-admin__action-btn--remove"
												onClick={() => handleRemovePlayer(userId)}
												disabled={actionLoading}
											>
												Remove
															</button>
														)}
														{statusRaw === 'withdrawn' && (
															<span className="tournament-admin__note">No actions</span>
														)}
													</div>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)}
				</div>
			)}
		</div>
	);
};

export default TournamentDetail;
