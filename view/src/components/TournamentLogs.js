import React, { useEffect, useMemo, useState } from 'react';
import { tournamentAPI } from '../services/api';
import './TournamentLogs.css';

const EVENT_TYPES = [
	'tournament.created',
	'tournament.updated',
	'tournament.started',
	'tournament.ended',
	'pairing.summary',
	'intervention.manual',
	'game.cancelled',
];

const TournamentLogs = ({ tournamentId }) => {
	const [logs, setLogs] = useState([]);
	const [eventType, setEventType] = useState('');
	const [roundNumber, setRoundNumber] = useState('');
	const [search, setSearch] = useState('');
	const [expanded, setExpanded] = useState(null);
	const [error, setError] = useState('');

	useEffect(() => {
		let cancelled = false;
		setError('');
		tournamentAPI.getLogs(tournamentId, { eventType, roundNumber, limit: 150 })
			.then((res) => {
				if (!cancelled) setLogs(Array.isArray(res.data) ? res.data : []);
			})
			.catch((err) => {
				if (!cancelled) setError(err.message || 'Failed to load logs');
			});
		return () => {
			cancelled = true;
		};
	}, [eventType, roundNumber, tournamentId]);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return logs;
		return logs.filter((log) => `${log.eventType} ${log.message}`.toLowerCase().includes(q));
	}, [logs, search]);

	return (
		<div className="tournament-logs">
			<div className="tournament-logs__filters">
				<select className="form-select form-select-sm" value={eventType} onChange={(event) => setEventType(event.target.value)}>
					<option value="">All events</option>
					{EVENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
				</select>
				<input className="form-control form-control-sm" type="number" min="1" placeholder="Round" value={roundNumber} onChange={(event) => setRoundNumber(event.target.value)} />
				<input className="form-control form-control-sm" type="search" placeholder="Search" value={search} onChange={(event) => setSearch(event.target.value)} />
			</div>
			{error && <div className="alert alert-warning">{error}</div>}
			<div className="tournament-logs__list">
				{filtered.length === 0 ? (
					<p className="tournament-logs__empty">No logs found.</p>
				) : filtered.map((log) => (
					<div key={log.id} className="tournament-logs__row">
						<div className="tournament-logs__main">
							<span className="tournament-logs__time">{new Date(log.createdAt).toLocaleString()}</span>
							<span className="tournament-logs__badge">{log.eventType}</span>
							<span className="tournament-logs__message">{log.message}</span>
							{log.actor?.username && <span className="tournament-logs__actor">{log.actor.username}</span>}
						</div>
						{log.payload && (
							<button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
								Details
							</button>
						)}
						{expanded === log.id && (
							<pre className="tournament-logs__payload">{JSON.stringify(log.payload, null, 2)}</pre>
						)}
					</div>
				))}
			</div>
		</div>
	);
};

export default TournamentLogs;
