// src/pages/AdminOngoingGames.jsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { tournamentAPI, gameAPI } from '../services/api';
import Card from '../components/Card';
import Spinner from '../components/Spinner';
import Table from '../components/Table';
import Badge from '../components/Badge';
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
					const { data: games } = await tournamentAPI.getTournamentGames(t.id);
					return [t.id, (games || []).filter(g => !g.isFinished)];
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
			const gs = gamesByTid[t.id] || [];
			for (const g of gs) rows.push({ t, g });
		}
		// sort by start time or fallback to name
		rows.sort((a, b) => (new Date(a.g.startedAt || 0)) - (new Date(b.g.startedAt || 0)));
		return rows;
	}, [tournaments, gamesByTid]);

	const finishGame = async (gameId, result) => {
		try {
			setSubmitting(gameId);
			await gameAPI.submitGameResult(gameId, result);
			await load();
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
				<Spinner text="Loading ongoing games…" className="admin-ongoing-games__loading" />
			) : ongoing.length === 0 ? (
					<div className="alert alert-info">No ongoing games right now.</div>
				) : (
						<Card className="admin-ongoing-games__card">
							<Card.Header className="admin-ongoing-games__card-header">
								<Card.Title className="admin-ongoing-games__card-title">All ongoing games</Card.Title>
							</Card.Header>
							<div className="admin-ongoing-games__table-wrapper">
								<Table className="admin-ongoing-games__table">
									<Table.Head>
										<Table.Row>
											<Table.Header>Tournament</Table.Header>
											<Table.Header>White</Table.Header>
											<Table.Header>Black</Table.Header>
											<Table.Header>Status</Table.Header>
											<Table.Header className="text-end">Set Result</Table.Header>
										</Table.Row>
									</Table.Head>
									<Table.Body>
									{ongoing.map(({ t, g }) => (
										<Table.Row key={g.id}>
											<Table.Cell>{t.name}</Table.Cell>
											<Table.Cell>{g.playerWhite?.name || g.playerWhite?.username || g.playerWhite}</Table.Cell>
											<Table.Cell>{g.playerBlack?.name || g.playerBlack?.username || g.playerBlack}</Table.Cell>
												<Table.Cell><Badge type="warning">Ongoing</Badge></Table.Cell>
												<Table.Cell className="text-end">
												<ResultButtons
													disabled={!!submitting}
													onResult={(r) => finishGame(g.id, r)}
												/>
												</Table.Cell>
											</Table.Row>
										))}
									</Table.Body>
								</Table>
							</div>
						</Card>
					)}
		</div>
	);
};

export default AdminOngoingGames;
