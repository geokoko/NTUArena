import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { tournamentAPI } from '../services/api';
import './TournamentList.css';

const TournamentList = () => {
	const [tournaments, setTournaments] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	const loadTournaments = useCallback(async () => {
		setLoading(true);
		try {
			const { data } = await tournamentAPI.getAllTournaments();
			setTournaments(Array.isArray(data) ? data : []);
			setError('');
		} catch (err) {
			if (err.status === 404) {
				setError('Tournaments not found');
			} else if (err.status === 0) {
				setError('Cannot reach server. Please try again.');
			} else {
				setError(err.message || 'Failed to load tournaments');
			}
			console.error('Load tournaments error:', err);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadTournaments();
	}, [loadTournaments]);

	const handleJoinTournament = async (tournamentId) => {
		alert('Authentication required to join tournaments');
	};

	const handleLeaveTournament = async (tournamentId) => {
		alert('Authentication required to leave tournaments');
	};

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

	if (loading) {
		return (
			<div className="text-center">
				<div className="loading-spinner"></div>
				<p>Loading tournaments...</p>
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

	const renderDate = (value) => {
		if (!value) return '—';
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
	};

	const renderParticipants = (participants, max) => {
		const count = Array.isArray(participants) ? participants.length : 0;
		const limit = Number.isFinite(max) ? max : '∞';
		return `${count} / ${limit}`;
	};

	return (
		<div>
			<div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
				<h1 className="m-0">Tournaments</h1>
				<div className="d-flex gap-2">
					<button className="btn btn-outline-secondary" onClick={loadTournaments}>Refresh</button>
					<Link to="/admin/tournaments/new" className="btn btn-primary">
						Create Tournament
					</Link>
				</div>
			</div>

			{tournaments.length === 0 ? (
				<div className="card">
					<div className="card-body text-center">
						<p className="text-muted mb-3">No tournaments available at the moment.</p>
						<Link to="/admin/tournaments/new" className="btn btn-primary">
							Create your first tournament
						</Link>
					</div>
				</div>
			) : (
				<div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px' }}>
					{tournaments.map((tournament) => {
						const status = tournament.tournStatus || 'upcoming';
						const participantCount = Array.isArray(tournament.participants) ? tournament.participants.length : 0;
						const maxAllowed = Number.isFinite(tournament.maxPlayers) ? tournament.maxPlayers : Infinity;
						return (
							<div key={tournament._id || tournament.name} className="card">
								<div className="card-header">
									<div className="d-flex justify-content-between align-items-center">
										<h3 className="card-title mb-0">{tournament.name || 'Untitled Tournament'}</h3>
										{getStatusBadge(status)}
									</div>
								</div>
								<div className="card-body">
									<p><strong>Location:</strong> {tournament.tournLocation || '—'}</p>
									<p><strong>Start Date:</strong> {renderDate(tournament.startDate)}</p>
									<p><strong>End Date:</strong> {renderDate(tournament.endDate)}</p>
									<p><strong>Participants:</strong> {renderParticipants(tournament.participants, tournament.maxPlayers)}</p>
									{tournament.description && <p className="small text-muted">{tournament.description}</p>}

									<div className="d-flex gap-2 mt-3">
										<Link to={`/tournament/${tournament._id}`} className="btn btn-outline-primary">
											View Details
										</Link>
									<button
										onClick={() => handleJoinTournament(tournament._id)}
										className="btn btn-success"
										disabled={status === 'completed' || participantCount >= maxAllowed}
									>
											Join Tournament
										</button>
										<button
											onClick={() => handleLeaveTournament(tournament._id)}
											className="btn btn-outline-secondary"
										>
											Leave
										</button>
									</div>
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
};

export default TournamentList; 
