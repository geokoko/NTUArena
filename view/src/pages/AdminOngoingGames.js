// src/pages/AdminOngoingGames.jsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { tournamentAPI, gameAPI } from '../services/api';
import './AdminOngoingGames.css';

const ResultButtons = ({ onResult, disabled }) => (
	<div className="admin-ongoing-games__result-buttons d-flex gap-2">
		<button className="btn btn-sm btn-success" disabled={disabled} onClick={() => onResult('white')}>
			White wins
		</button>
		<button className="btn btn-sm btn-dark" disabled={disabled} onClick={() => onResult('black')}>
			Black wins
		</button>
		<button className="btn btn-sm btn-secondary" disabled={disabled} onClick={() => onResult('draw')}>
			Draw
		</button>
	</div>
);

const Badge = ({ children, kind = 'secondary' }) => (
	<span className={`badge badge-${kind} admin-ongoing-games__badge`}>{children}</span>
);

const AdminOngoingGames = () => {
	const [tournaments, setTournaments] = useState([]);
	const [gamesByTid, setGamesByTid] = useState({});
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(null); // gameId while submitting
	const [error, setError] = useState('');
	const [autoRefresh, setAutoRefresh] = useState(true);

	const load = useCallback(async () => {
		setError('');
		try {
			const { data: all } = await tournamentAPI.getAllTournaments();
			const active = (all || []).filter(t => t.tournStatus === 'in progress');
			setTournaments(active);

			// fetch games per tournament in parallel
			const pairs = await Promise.all(
				active.map(async (t) => {
					const { data: games } = await tournamentAPI.getTournamentGames(t._id);
					return [t._id, (games || []).filter(g => !g.isFinished)];
				})
			);

			const next = {};
			for (const [tid, og] of pairs) next[tid] = og;
			setGamesByTid(next);
		} catch (e) {
			setError(e.message || 'Failed to load ongoing games');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	useEffect(() => {
		if (!autoRefresh) return;
		const id = setInterval(() => load().catch(() => {}), 10000);
		return () => clearInterval(id);
	}, [autoRefresh, load]);

	const ongoing = useMemo(() => {
		const rows = [];
		for (const t of tournaments) {
			const gs = gamesByTid[t._id] || [];
			for (const g of gs) rows.push({ t, g });
		}
		// sort by start time or id fallback
		rows.sort((a, b) => (new Date(a.g.createdAt || 0)) - (new Date(b.g.createdAt || 0)));
		return rows;
	}, [tournaments, gamesByTid]);

	const finishGame = async (gameId, result) => {
		try {
			setSubmitting(gameId);
			await gameAPI.submitGameResult(gameId, result);

			setGamesByTid((prev) => {
				const next = { ...prev };
				for (const tid of Object.keys(next)) {
					next[tid] = next[tid].filter(g => g._id !== gameId);
				}
				return next;
			});
		} catch (e) {
			alert(e.message || 'Failed to submit result');
		} finally {
			setSubmitting(null);
		}
	};

	return (
		<div className="admin-ongoing-games">
			<div className="admin-ongoing-games__toolbar d-flex justify-content-between align-items-center mb-4">
				<h1>Admin · Ongoing Games</h1>
				<div className="admin-ongoing-games__toolbar-controls d-flex align-items-center gap-3">
					<div className="form-check form-switch admin-ongoing-games__autorefresh">
						<input
							id="autorefresh"
							type="checkbox"
							className="form-check-input"
							checked={autoRefresh}
							onChange={(e) => setAutoRefresh(e.target.checked)}
						/>
						<label className="form-check-label" htmlFor="autorefresh">Auto refresh (10s)</label>
					</div>
					<button className="btn btn-outline-secondary admin-ongoing-games__refresh" onClick={load} disabled={loading}>
						Refresh now
					</button>
				</div>
			</div>

			{error && <div className="alert alert-danger">{error}</div>}

			{loading ? (
				<div className="admin-ongoing-games__loading text-center">
					<div className="loading-spinner"></div>
					<p>Loading ongoing games…</p>
				</div>
			) : ongoing.length === 0 ? (
					<div className="alert alert-info">No ongoing games right now.</div>
				) : (
						<div className="card admin-ongoing-games__card">
							<div className="card-header admin-ongoing-games__card-header">
								<h3 className="card-title admin-ongoing-games__card-title">All ongoing games</h3>
							</div>
							<div className="admin-ongoing-games__table-wrapper">
								<table className="table admin-ongoing-games__table">
									<thead>
										<tr>
											<th>Game</th>
											<th>Tournament</th>
											<th>White</th>
											<th>Black</th>
											<th>Status</th>
											<th className="text-end">Set Result</th>
										</tr>
									</thead>
									<tbody>
										{ongoing.map(({ t, g }) => (
											<tr key={g._id}>
												<td>
													<code>{g._id.slice(-8)}</code>
												</td>
												<td>{t.name}</td>
												<td>{g.playerWhite?.username || g.playerWhite}</td>
												<td>{g.playerBlack?.username || g.playerBlack}</td>
												<td><Badge kind="warning">Ongoing</Badge></td>
												<td className="text-end">
													<ResultButtons
														disabled={!!submitting}
														onResult={(r) => finishGame(g._id, r)}
													/>
												</td>
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

export default AdminOngoingGames;
