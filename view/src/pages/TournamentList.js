import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { tournamentAPI } from '../services/api';
import './TournamentList.css';

const TournamentList = () => {
	const [tournaments, setTournaments] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	useEffect(() => {
		const fetchTournaments = async () => {
			try {
				const { data } = await tournamentAPI.getAllTournaments();
				setTournaments(data);
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
		};

		fetchTournaments();
	}, []);

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
			case 'active':
				return <span className="badge badge-success">Active</span>;
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

	return (
		<div>
			<div className="d-flex justify-content-between align-items-center mb-4">
				<h1>Tournaments</h1>
				<Link to="/admin" className="btn btn-primary">
					Manage Tournaments
				</Link>
			</div>

			{tournaments.length === 0 ? (
				<div className="card">
					<div className="text-center">
						<p className="text-muted">No tournaments available at the moment.</p>
						<Link to="/admin" className="btn btn-primary">
							Create Tournament
						</Link>
					</div>
				</div>
			) : (
					<div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px' }}>
						{tournaments.map((tournament) => (
							<div key={tournament._id} className="card">
								<div className="card-header">
									<div className="d-flex justify-content-between align-items-center">
										<h3 className="card-title">{tournament.name}</h3>
										{getStatusBadge(tournament.tournStatus)}
									</div>
								</div>
								<div>
									<p><strong>Location:</strong> {tournament.tournLocation}</p>
									<p><strong>Start Date:</strong> {new Date(tournament.startDate).toLocaleString()}</p>
									<p><strong>End Date:</strong> {new Date(tournament.endDate).toLocaleString()}</p>
									<p><strong>Participants:</strong> {tournament.participants.length} / {tournament.maxPlayers}</p>

									<div className="d-flex gap-2 mt-3">
										<Link to={`/tournament/${tournament._id}`} className="btn btn-primary">
											View Details
										</Link>

										<button 
											onClick={() => handleJoinTournament(tournament._id)}
											className="btn btn-success"
											disabled={tournament.tournStatus === 'completed' || tournament.participants.length >= tournament.maxPlayers}
										>
											Join Tournament
										</button>
									</div>
								</div>
							</div>
						))}
					</div>
				)}
		</div>
	);
};

export default TournamentList; 
