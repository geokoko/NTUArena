import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { tournamentAPI } from '../services/api';
import GameBoard from '../components/GameBoard';
import './TournamentDetail.css';

const PLAYERS_PER_PAGE = 15;

const TournamentDetail = ({ user }) => {
	const { id } = useParams();
	const [tournament, setTournament] = useState(null);
	const [standings, setStandings] = useState([]);
	const [games, setGames] = useState([]);
	const [players, setPlayers] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [activeTab, setActiveTab] = useState('overview');
	const [currentPage, setCurrentPage] = useState(1);

	useEffect(() => {
		const fetchTournamentDetails = async () => {
			try {
				const [tournamentRes, standingsRes, gamesRes, playersRes] = await Promise.all([
					tournamentAPI.getTournament(id),
					tournamentAPI.getTournamentStandings(id),
					tournamentAPI.getTournamentGames(id),
					tournamentAPI.getTournamentPlayers(id),
				]);

				setTournament(tournamentRes.data);
				setStandings(standingsRes.data);
				setGames(gamesRes.data);
				setPlayers(playersRes.data);
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
		};

		fetchTournamentDetails();
	}, [id]);

	// Reset page when switching tabs
	useEffect(() => {
		setCurrentPage(1);
	}, [activeTab]);

	// Pagination logic for standings
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
		if (!game.isFinished) {
			return <span className="badge badge-warning">Ongoing</span>;
		}

		if (game.resultColor === 'white') {
			return <span className="badge badge-success">1-0</span>;
		} else if (game.resultColor === 'black') {
			return <span className="badge badge-success">0-1</span>;
		} else {
			return <span className="badge badge-secondary">½-½</span>;
		}
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
		// Check for winning streaks based on recent performance
		const winRate = standing.games > 0 ? standing.wins / standing.games : 0;
		if (standing.wins >= 3 && winRate >= 0.7) {
			return <span className="streak-fire" title="On fire!">🔥</span>;
		}
		return null;
	};

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
			{/* Header */}
			<div className="d-flex justify-content-between align-items-center mb-4">
				<div>
					<h1>{tournament.name}</h1>
					{getStatusBadge(tournament.tournStatus)}
				</div>
				<Link to="/tournaments" className="btn btn-secondary">
					Back to Tournaments
				</Link>
			</div>

			{/* Navigation Tabs */}
			<div className="tournament-tabs mb-4">
				<div className="d-flex gap-2">
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
						onClick={() => setActiveTab('games')}
						className={`btn ${activeTab === 'games' ? 'btn-primary' : 'btn-secondary'}`}
					>
						Games
					</button>
				</div>
			</div>

			{/* Tab Content */}
			{activeTab === 'overview' && (
				<div className="overview-content">
					{/* Tournament Information Card - Only visible in Overview */}
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
								<span className="info-value">{new Date(tournament.startDate).toLocaleString()}</span>
							</div>
							<div className="info-item">
								<span className="info-label">End Date</span>
								<span className="info-value">{new Date(tournament.endDate).toLocaleString()}</span>
							</div>
							<div className="info-item">
								<span className="info-label">Current Players</span>
								<span className="info-value">{tournament.participants?.length || players.length}</span>
							</div>
						</div>
					</div>

					{/* Quick Stats Card */}
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
										<span className="stat-value">{games.filter(g => g.isFinished).length}</span>
										<span className="stat-label">Completed</span>
									</div>
									<div className="stat-item">
										<span className="stat-value">{games.filter(g => !g.isFinished).length}</span>
										<span className="stat-label">Ongoing</span>
									</div>
									<div className="stat-item">
										<span className="stat-value">{players.filter(p => (p.status || 'active') === 'active').length}</span>
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

								{/* Pagination */}
								{totalPages > 1 && (
									<div className="standings-pagination">
										<button 
											className="pagination-btn"
											onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
											disabled={currentPage === 1}
										>
											← Previous
										</button>
										
										<div className="pagination-pages">
											{Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
												// Show first, last, current, and adjacent pages
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
											onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
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

			{activeTab === 'games' && (
				<div className="card games-content">
					<div className="card-header">
						<h3 className="card-title">Tournament Games</h3>
					</div>
					<div className="row">
						{games.length === 0 ? (
							<div className="col-12">
								<p className="text-muted text-center">No games yet.</p>
							</div>
						) : (
							games.map((game) => (
								<div key={game.id} className="col-md-6 mb-4">
									<GameBoard
										gameId={game.id}
										player1={game.playerWhite?.name || game.playerWhite?.username}
										player2={game.playerBlack?.name || game.playerBlack?.username}
										player1Rating={game.playerWhite?.liveRating}
										player2Rating={game.playerBlack?.liveRating}
										result={getGameResultDisplay(game)}
										isLive={!game.isFinished}
										gameState={null}
									/>
								</div>
							))
						)}
					</div>
				</div>
			)}
		</div>
	);
};

export default TournamentDetail; 
