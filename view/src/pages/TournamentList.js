import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { tournamentAPI } from '../services/api';
import { statusBadge, formatDate, summarizeDescription } from '../utils/tournamentDisplay';
import './TournamentList.css';

const TournamentList = () => {
	const [tournaments, setTournaments] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [cardLoading, setCardLoading] = useState({});
	const [cardError, setCardError] = useState({});
	const navigate = useNavigate();

	const updateCardLoading = (id, value) => setCardLoading((prev) => ({ ...prev, [id]: value }));
	const updateCardError = (id, value) => setCardError((prev) => ({ ...prev, [id]: value }));

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

	useEffect(() => {
		loadTournaments();
	}, [loadTournaments]);

	const handleDelete = async (id, event) => {
		if (event) event.stopPropagation();
		if (!id) return;
		if (!window.confirm('Delete this tournament?')) return;
		updateCardLoading(id, true);
		updateCardError(id, '');
		try {
			await tournamentAPI.deleteTournament(id);
			await loadTournaments(true);
		} catch (err) {
			updateCardError(id, err.message || 'Failed to delete tournament');
		} finally {
			updateCardLoading(id, false);
		}
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
				{tournaments.map((tournament) => {
					const tournamentId = tournament.id;
					const isDeleting = Boolean(tournamentId) && cardLoading[tournamentId];
					const errorMessage = tournamentId ? cardError[tournamentId] : '';
					const isClickable = Boolean(tournamentId);

					return (
							<div
								key={tournamentId || tournament.name}
								className={`card shadow-sm tournament-card ${isClickable ? 'tournament-card--clickable' : 'tournament-card--disabled'}`}
								onClick={() => isClickable && navigate(`/tournament/${tournamentId}`)}
								role={isClickable ? 'button' : undefined}
								tabIndex={isClickable ? 0 : -1}
								onKeyDown={(event) => {
									if (!isClickable) return;
									if (event.key === 'Enter' || event.key === ' ') {
										event.preventDefault();
										navigate(`/tournament/${tournamentId}`);
									}
								}}
							>
								<div className="card-header tournament-card__header">
									<h3 className="card-title mb-0">{tournament.name || 'Untitled Tournament'}</h3>
									<div className="tournament-card__header-actions">
										{statusBadge(tournament.tournStatus)}
										<button
											type="button"
											className="tournament-card__delete"
											onClick={(event) => handleDelete(tournamentId, event)}
											disabled={!tournamentId || isDeleting}
											aria-label="Delete tournament"
											title="Delete tournament"
										>
											<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
												<path d="M9 3h6l1 2h5v2H3V5h5l1-2zm1 6h2v8h-2V9zm4 0h2v8h-2V9zM7 9h2v8H7V9z" />
											</svg>
										</button>
									</div>
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
								{errorMessage && <div className="text-danger small mb-2">{errorMessage}</div>}
								<div className="tournament-card__footer-hint">
									Click to view tournament details
								</div>
							</div>
						</div>
					);
				})}
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

			{renderTournamentCards()}
		</div>
	);
};

export default TournamentList;
