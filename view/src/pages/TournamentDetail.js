import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { tournamentAPI } from '../services/api';
import GameBoard from '../components/GameBoard';
import './TournamentDetail.css';

const TournamentDetail = ({ user }) => {
	const { id } = useParams();
	const [tournament, setTournament] = useState(null);
	const [standings, setStandings] = useState([]);
	const [games, setGames] = useState([]);
	const [players, setPlayers] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [activeTab, setActiveTab] = useState('overview');

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

	const formatPlayerStatus = (status) => {
		if (!status) return 'Active';
		return status.replace(/\b\w/g, (char) => char.toUpperCase());
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
		<div>
			<div className="d-flex justify-content-between align-items-center mb-4">
				<div>
					<h1>{tournament.name}</h1>
					{getStatusBadge(tournament.tournStatus)}
				</div>
				<Link to="/tournaments" className="btn btn-secondary">
					Back to Tournaments
				</Link>
			</div>

			{/* Tournament Overview */}
			<div className="card mb-4">
				<div className="card-header">
					<h3 className="card-title">Tournament Information</h3>
				</div>
				<div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
					<div>
						<p><strong>Location:</strong> {tournament.tournLocation}</p>
						<p><strong>Time Control:</strong> {tournament.timeControl}</p>
						<p><strong>Max Players:</strong> {tournament.maxPlayers}</p>
					</div>
					<div>
						<p><strong>Start Date:</strong> {new Date(tournament.startDate).toLocaleString()}</p>
						<p><strong>End Date:</strong> {new Date(tournament.endDate).toLocaleString()}</p>
						<p><strong>Current Players:</strong> {tournament.participants.length}</p>
					</div>
				</div>
			</div>

			{/* Navigation Tabs */}
			<div className="mb-4">
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
					<button 
						onClick={() => setActiveTab('players')}
						className={`btn ${activeTab === 'players' ? 'btn-primary' : 'btn-secondary'}`}
					>
						Players
					</button>
				</div>
			</div>

			{/* Tab Content */}
			{activeTab === 'overview' && (
				<div className="card">
					<div className="card-header">
						<h3 className="card-title">Tournament Overview</h3>
					</div>
						<div>
							<p>{tournament.description}</p>
							<div className="mt-3">
								<h4>Quick Stats:</h4>
								{(() => {
									const activePlayers = players.filter(p => (p.status || 'active') === 'active').length;
									const pausedPlayers = players.filter(p => p.status === 'paused').length;
									const withdrawnPlayers = players.filter(p => p.status === 'withdrawn').length;
									return (
									<ul>
										<li>Total Games: {games.length}</li>
										<li>Completed Games: {games.filter(g => g.isFinished).length}</li>
										<li>Ongoing Games: {games.filter(g => !g.isFinished).length}</li>
										<li>Players Registered: {players.length}</li>
										<li>Active Players: {activePlayers}</li>
										<li>Paused Players: {pausedPlayers}</li>
										<li>Withdrawn Players: {withdrawnPlayers}</li>
									</ul>
									);
								})()}
							</div>
						</div>
				</div>
			)}

			{activeTab === 'standings' && (
				<div className="card">
					<div className="card-header">
						<h3 className="card-title">Tournament Standings</h3>
					</div>
					<div>
						<table className="table">
							<thead>
								<tr>
									<th>Rank</th>
									<th>Player</th>
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
								{standings.map((standing) => (
									<tr key={standing.player.id}>
										<td>{standing.rank}</td>
										<td>{standing.player.name || standing.player.username}</td>
										<td>{formatPlayerStatus(standing.player.status)}</td>
										<td>{standing.score}</td>
										<td>{standing.games}</td>
										<td>{standing.liveRating}</td>
										<td className="text-center">{standing.wins ?? 0}</td>
										<td className="text-center">{standing.draws ?? 0}</td>
										<td className="text-center">{standing.losses ?? 0}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{activeTab === 'games' && (
				<div className="card">
					<div className="card-header">
						<h3 className="card-title">Tournament Games</h3>
					</div>
					<div className="row">
						{games.map((game) => (
							<div key={game.id} className="col-md-6 mb-4">
								<GameBoard
									gameId={game.id}
									player1={game.playerWhite?.name || game.playerWhite?.username}
									player2={game.playerBlack?.name || game.playerBlack?.username}
									player1Rating={game.playerWhite?.liveRating}
									player2Rating={game.playerBlack?.liveRating}
									result={getGameResultDisplay(game)}
									isLive={!game.isFinished}
									gameState={null} // This would come from the actual game state
								/>
							</div>
						))}
					</div>
				</div>
			)}

			{activeTab === 'players' && (
				<div className="card">
					<div className="card-header">
						<h3 className="card-title">Tournament Players</h3>
					</div>
					<div>
						<table className="table">
							<thead>
								<tr>
									<th>Player</th>
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
								{players.map((player) => (
									<tr key={player.id}>
										<td>{player.name || player.username}</td>
										<td>{formatPlayerStatus(player.status)}</td>
										<td>{player.score}</td>
										<td>{player.gamesPlayed ?? player.games ?? 0}</td>
										<td>{player.liveRating}</td>
										<td className="text-center">{player.wins ?? 0}</td>
										<td className="text-center">{player.draws ?? 0}</td>
										<td className="text-center">{player.losses ?? 0}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</div>
	);
};

export default TournamentDetail; 
