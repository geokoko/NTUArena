import React, { useState, useEffect, useCallback } from 'react';
import { tournamentAPI, userAPI, healthAPI, gameAPI } from '../services/api';
import { Link } from 'react-router-dom';

const Badge = ({ kind = 'secondary', children }) =>
	<span className={`badge bg-${kind}`}>{children}</span>;

const Spinner = () => (
	<div className="text-center my-4">
		<div className="spinner-border" role="status" />
	</div>
);

const AdminDashboard = () => {
	const [activeTab, setActiveTab] = useState('tournaments');

	// tournaments
	const [tournaments, setTournaments] = useState([]);
	const [loading, setLoading] = useState(false);
	const [tError, setTError] = useState('');

	// users
	const [users, setUsers] = useState([]);
	const [uError, setUError] = useState('');
	const [newUser, setNewUser] = useState({ username: '', email: '', globalElo: 1200, role: 'player' });

	// system
	const [systemHealth, setSystemHealth] = useState(null);
	const [sError, setSError] = useState('');

	// per-tournament select to add/remove player (by userId)
	const [selectedAddUserByTid, setSelectedAddUserByTid] = useState({});
	const [selectedRemoveUserByTid, setSelectedRemoveUserByTid] = useState({});

	// Active games (per tournament section)
	const [activeGamesByTid, setActiveGamesByTid] = useState({});
	const [gamesLoading, setGamesLoading] = useState(false);

	const statusBadge = (st) => {
		const map = { 'upcoming': 'warning', 'in progress': 'success', 'completed': 'secondary' };
		return <Badge kind={map[st] || 'light'}>{st}</Badge>;
	};

	const loadTournaments = useCallback(async () => {
		setLoading(true); setTError('');
		try {
			const { data } = await tournamentAPI.getAllTournaments();
			setTournaments(data || []);
		} catch (e) {
			setTError(e.message);
		} finally { setLoading(false); }
	}, []);

	const loadUsers = useCallback(async () => {
		setUError('');
		try {
			const res = await userAPI.getAll();
			setUsers(res.data?.users || res.data || []);
		} catch (e) {
			setUError(e.message);
		}
	}, []);

	const loadSystem = useCallback(async () => {
		setSError('');
		try {
			const { data } = await healthAPI.checkHealth(); // <- correct: /health
			setSystemHealth(data);
		} catch (e) {
			setSError(e.message);
		}
	}, []);

	const loadActiveGames = useCallback(async (tidList) => {
		setGamesLoading(true);
		try {
			const pairs = await Promise.all(tidList.map(async (tid) => {
				const { data } = await tournamentAPI.getTournamentGames(tid);
				const ongoing = (data || []).filter(g => !g.isFinished);
				return [tid, ongoing];
			}));
			const next = {};
			for (const [tid, og] of pairs) next[tid] = og;
			setActiveGamesByTid(next);
		} finally {
			setGamesLoading(false);
		}
	}, []);

	useEffect(() => {
		const boot = async () => {
			if (activeTab === 'tournaments') {
				await Promise.all([loadTournaments(), loadUsers()]);
			} else if (activeTab === 'users') {
				await loadUsers();
			} else if (activeTab === 'system') {
				await loadSystem();
			}
		};
		boot();
	}, [activeTab, loadSystem, loadTournaments, loadUsers]);

	useEffect(() => {
		if (tournaments.length)
			loadActiveGames(tournaments.map(t => t._id));
	}, [tournaments, loadActiveGames]);

	const addPlayerToTournament = async (tid) => {
		const userId = selectedAddUserByTid[tid];
		if (!userId) return alert('Pick a user to add');
		await tournamentAPI.joinTournament(tid, userId);
		const { data } = await tournamentAPI.getTournament(tid);
		setTournaments(prev => prev.map(t => t._id === tid ? data : t));
		await loadActiveGames([tid]);
	};

	const removePlayerFromTournament = async (tid) => {
		const userId = selectedRemoveUserByTid[tid];
		if (!userId) return alert('Pick a user to remove');
		await tournamentAPI.leaveTournament(tid, userId);
		const { data } = await tournamentAPI.getTournament(tid);
		setTournaments(prev => prev.map(t => t._id === tid ? data : t));
		await loadActiveGames([tid]);
	};

	const startTournament = async (tid) => {
		await tournamentAPI.startTournament(tid);
		setTournaments(prev => prev.map(t => t._id === tid ? { ...t, tournStatus: 'in progress' } : t));
	};

	const endTournament = async (tid) => {
		await tournamentAPI.endTournament(tid);
		setTournaments(prev => prev.map(t => t._id === tid ? { ...t, tournStatus: 'completed' } : t));
		await loadActiveGames([tid]);
	};

	const deleteTournament = async (tid) => {
		if (!window.confirm('Delete tournament?')) return;
		await tournamentAPI.deleteTournament(tid);
		setTournaments(prev => prev.filter(t => t._id !== tid));
	};

	const handleSubmitUser = async (e) => {
		e.preventDefault();
		await userAPI.addUser(newUser);
		setNewUser({ username: '', email: '', globalElo: 1200, role: 'player' });
		await loadUsers();
	};

	const submitResult = async (gameId, result) => {
		await gameAPI.submitGameResult(gameId, result);
		// drop from active list locally
		setActiveGamesByTid(prev => {
			const next = { ...prev };
			for (const tid of Object.keys(next)) next[tid] = next[tid].filter(g => g._id !== gameId);
			return next;
		});
	};

	return (
		<div className="container my-4">
			<div className="d-flex justify-content-between align-items-center mb-4">
				<h1 className="m-0">Admin Dashboard</h1>
				<Link to="/admin/games" className="btn btn-outline-primary">Ongoing Games</Link>
			</div>

			<div className="mb-3 d-flex gap-2">
				<button className={`btn ${activeTab === 'tournaments' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setActiveTab('tournaments')}>Tournaments</button>
				<button className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setActiveTab('users')}>Users</button>
				<button className={`btn ${activeTab === 'system' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setActiveTab('system')}>System</button>
			</div>

			{/* Tournaments */}
			{activeTab === 'tournaments' && (
				<div className="card">
					<div className="card-header">
						<h4 className="m-0">Tournament Management</h4>
					</div>
					<div className="card-body">
						{tError && <div className="alert alert-danger">{tError}</div>}
						{loading ? <Spinner/> : (
							<>
								<div className="d-flex justify-content-between align-items-center mb-3">
									<Link to="/tournaments" className="btn btn-sm btn-outline-secondary">View Tournaments</Link>
									<button className="btn btn-sm btn-outline-secondary" onClick={loadTournaments}>Refresh</button>
								</div>

								<div className="table-responsive">
									<table className="table align-middle">
										<thead>
											<tr>
												<th>Name</th>
												<th>Status</th>
												<th>Players</th>
												<th>Start</th>
												<th>Controls</th>
												<th style={{minWidth: 340}}>Add/Remove Player</th>
											</tr>
										</thead>
										<tbody>
											{tournaments.map(t => (
												<tr key={t._id}>
													<td><Link to={`/tournament/${t._id}`}>{t.name || t.title || 'Tournament'}</Link></td>
													<td>{statusBadge(t.tournStatus)}</td>
													<td>{t.participants?.length ?? 0}</td>
													<td>{t.startDate ? new Date(t.startDate).toLocaleString() : '-'}</td>
													<td className="d-flex gap-2">
														{t.tournStatus === 'upcoming' && <button className="btn btn-sm btn-success" onClick={() => startTournament(t._id)}>Start</button>}
														{t.tournStatus === 'in progress' && <button className="btn btn-sm btn-warning" onClick={() => endTournament(t._id)}>End</button>}
														<button className="btn btn-sm btn-outline-danger" onClick={() => deleteTournament(t._id)}>Delete</button>
													</td>
													<td>
														<div className="d-flex flex-wrap gap-2">
															{/* Add */}
															<div className="d-flex gap-2">
																<select
																	className="form-select form-select-sm"
																	style={{ maxWidth: 220 }}
																	value={selectedAddUserByTid[t._id] || ''}
																	onChange={(e) => setSelectedAddUserByTid(s => ({ ...s, [t._id]: e.target.value }))}
																>
																	<option value="">Add: select user</option>
																	{users.map(u => <option key={u._id} value={u._id}>{u.username || u.email}</option>)}
																</select>
																<button className="btn btn-sm btn-primary" onClick={() => addPlayerToTournament(t._id)}>Add</button>
															</div>
															{/* Remove */}
															<div className="d-flex gap-2">
																<select
																	className="form-select form-select-sm"
																	style={{ maxWidth: 220 }}
																	value={selectedRemoveUserByTid[t._id] || ''}
																	onChange={(e) => setSelectedRemoveUserByTid(s => ({ ...s, [t._id]: e.target.value }))}
																>
																	<option value="">Remove: select user</option>
																	{users.map(u => <option key={u._id} value={u._id}>{u.username || u.email}</option>)}
																</select>
																<button className="btn btn-sm btn-outline-danger" onClick={() => removePlayerFromTournament(t._id)}>Remove</button>
															</div>
														</div>
													</td>
												</tr>
											))}
											{tournaments.length === 0 && (
												<tr><td colSpan="6" className="text-center text-muted">No tournaments</td></tr>
											)}
										</tbody>
									</table>
								</div>

								{/* Active games per tournament (with set result) */}
								<div className="mt-4">
									<h5>Active Games by Tournament</h5>
									{gamesLoading ? <Spinner/> : (
										tournaments.map(t => (
											<div className="card mb-3" key={`g-${t._id}`}>
												<div className="card-header d-flex justify-content-between">
													<span>{t.name || t.title}</span>
													<button className="btn btn-sm btn-outline-secondary" onClick={() => loadActiveGames([t._id])}>Refresh</button>
												</div>
												<div className="card-body p-0">
													<div className="table-responsive">
														<table className="table table-sm m-0">
															<thead><tr><th>Game</th><th>White</th><th>Black</th><th>Status</th><th className="text-end">Set Result</th></tr></thead>
															<tbody>
																{(activeGamesByTid[t._id] || []).length === 0 ? (
																	<tr><td colSpan="5" className="text-muted text-center py-3">No ongoing games</td></tr>
																) : (activeGamesByTid[t._id] || []).map(g => (
																		<tr key={g._id}>
																			<td><code>{String(g._id).slice(-8)}</code></td>
																			<td>{g.playerWhite?.username || g.playerWhite}</td>
																			<td>{g.playerBlack?.username || g.playerBlack}</td>
																			<td><Badge kind="warning">Ongoing</Badge></td>
																			<td className="text-end">
																				<div className="btn-group btn-group-sm">
																					<button className="btn btn-success" onClick={() => submitResult(g._id, 'white')}>White</button>
																					<button className="btn btn-dark" onClick={() => submitResult(g._id, 'black')}>Black</button>
																					<button className="btn btn-secondary" onClick={() => submitResult(g._id, 'draw')}>Draw</button>
																				</div>
																			</td>
																		</tr>
																	))}
															</tbody>
														</table>
													</div>
												</div>
											</div>
										))
									)}
								</div>
							</>
						)}
					</div>
				</div>
			)}

			{/* Users */}
			{activeTab === 'users' && (
				<div className="card">
					<div className="card-header"><h4 className="m-0">User Management</h4></div>
					<div className="card-body">
						{uError && <div className="alert alert-danger">{uError}</div>}

						<form className="row g-2 mb-3" onSubmit={handleSubmitUser}>
							<div className="col-auto">
								<input className="form-control" placeholder="Username" value={newUser.username}
									onChange={(e) => setNewUser(s => ({ ...s, username: e.target.value }))} required />
							</div>
							<div className="col-auto">
								<input className="form-control" type="email" placeholder="Email" value={newUser.email}
									onChange={(e) => setNewUser(s => ({ ...s, email: e.target.value }))} required />
							</div>
							<div className="col-auto">
								<input className="form-control" type="number" placeholder="Global ELO" value={newUser.globalElo}
									onChange={(e) => setNewUser(s => ({ ...s, globalElo: parseInt(e.target.value || '0', 10) }))} />
							</div>
							<div className="col-auto">
								<select className="form-select" value={newUser.role} onChange={(e) => setNewUser(s => ({ ...s, role: e.target.value }))}>
									<option value="player">player</option>
									<option value="admin">admin</option>
								</select>
							</div>
							<div className="col-auto">
								<button className="btn btn-primary" type="submit">Create</button>
							</div>
						</form>

						<div className="table-responsive">
							<table className="table align-middle">
								<thead><tr><th>User</th><th>Email</th><th>ELO</th><th>Role</th><th className="text-end">Actions</th></tr></thead>
								<tbody>
									{users.map(u => (
										<tr key={u._id}>
											<td>{u.username || '-'}</td>
											<td>{u.email || '-'}</td>
											<td>{u.globalElo ?? '-'}</td>
											<td><Badge>{u.role || 'player'}</Badge></td>
											<td className="text-end">
												<button className="btn btn-sm btn-outline-danger" onClick={async () => { await userAPI.deleteUser(u._id); await loadUsers(); }}>Delete</button>
											</td>
										</tr>
									))}
									{users.length === 0 && (
										<tr><td colSpan="5" className="text-center text-muted">No users</td></tr>
									)}
								</tbody>
							</table>
						</div>

					</div>
				</div>
			)}

			{/* System */}
			{activeTab === 'system' && (
				<div className="card">
					<div className="card-header"><h4 className="m-0">System Health</h4></div>
					<div className="card-body">
						{sError && <div className="alert alert-danger">{sError}</div>}
						{!systemHealth ? <p className="text-muted">No data</p> :
							<pre className="bg-light p-3 rounded" style={{ maxHeight: 350, overflow: 'auto' }}>
								{JSON.stringify(systemHealth, null, 2)}
							</pre>
						}
					</div>
				</div>
			)}

		</div>
	);
};

export default AdminDashboard;

