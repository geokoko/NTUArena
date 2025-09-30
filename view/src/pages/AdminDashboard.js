import React, { useState, useEffect, useCallback } from 'react';
import { tournamentAPI, userAPI, healthAPI, pairingAPI, gameAPI } from '../services/api';
import Card from '../components/Card';
import Button from '../components/Button';
import Badge from '../components/Badge';
import Table from '../components/Table';
import Form from '../components/Form';
import Spinner from '../components/Spinner';
import Alert from '../components/Alert';
import './AdminDashboard.css';

const AdminDashboard = () => {
	const [activeTab, setActiveTab] = useState('tournaments');
    const [tournaments, setTournaments] = useState([]);
    const [users, setUsers] = useState([]);
    const [activeGamesByTournament, setActiveGamesByTournament] = useState({});
	const [systemHealth, setSystemHealth] = useState(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');

    // Tournament form state
    const [tournamentForm, setTournamentForm] = useState({
        name: '',
        startDate: '',
        endDate: '',
        tournLocation: '',
        maxPlayers: 50,
        timeControl: '5+3',
        description: ''
    });

    // Admin: create user form
    const [newUser, setNewUser] = useState({ username: '', email: '', globalElo: 1200 });

    // UI: selected user per tournament for adding participants
    const [selectedUserByTournament, setSelectedUserByTournament] = useState({});

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError('');
            try {
                if (activeTab === 'tournaments') {
                    const [tournRes, usersRes] = await Promise.all([
                        tournamentAPI.getAllTournaments(),
                        userAPI.getAll(),
                    ]);
                    setTournaments(tournRes.data || []);
                    setUsers(usersRes.data?.users || []);
                } else if (activeTab === 'users') {
                    const usersRes = await userAPI.getAll();
                    setUsers(usersRes.data?.users || []);
                } else if (activeTab === 'system') {
                    const healthResponse = await healthAPI.checkServicesHealth();
                    setSystemHealth(healthResponse.data);
                }
            } catch (err) {
                if (err.status === 0) setError('Cannot reach server. Please try again.');
                else setError(err.message || 'Failed to load data');
                console.error('Admin fetch error:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [activeTab]);

    // Helper: refresh active games for a tournament
    const loadActiveGames = useCallback(async (tournamentId) => {
        try {
            const { data } = await tournamentAPI.getActiveTournamentGames(tournamentId);
            setActiveGamesByTournament(prev => ({ ...prev, [tournamentId]: data }));
        } catch (err) {
            console.error('Load active games error:', err);
        }
    }, []);

    // Auto scheduler: start tournaments when start time passes and generate games
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const { data: tlist } = await tournamentAPI.getAllTournaments();
                const now = new Date();
                for (const t of tlist) {
                    const start = new Date(t.startDate);
                    if (t.tournStatus === 'upcoming' && start <= now) {
                        try {
                            await tournamentAPI.startTournament(t._id);
                        } catch (e) {
                            // ignore if already started by another instance
                        }
                        await generateAndCreateGames(t._id);
                        await loadActiveGames(t._id);
                    }
                }
                setTournaments(tlist);
            } catch (e) {
                // silent
            }
        }, 15000);
        return () => clearInterval(interval);
    }, [loadActiveGames]);

    const handleTournamentSubmit = async (e) => {
        e.preventDefault();
        try {
            // If only duration given, compute endDate; otherwise use provided
            const payload = { ...tournamentForm };
            if (payload.startDate && payload.endDate && new Date(payload.endDate) <= new Date(payload.startDate)) {
                throw new Error('End date must be after start date');
            }
            await tournamentAPI.createTournament(payload);
            alert('Tournament created successfully!');
            setTournamentForm({
                name: '',
                startDate: '',
                endDate: '',
                tournLocation: '',
                maxPlayers: 50,
                timeControl: '5+3',
                description: ''
            });
            // Refresh tournaments
            const { data } = await tournamentAPI.getAllTournaments();
            setTournaments(data || []);
        } catch (err) {
            alert(err.message || 'Failed to create tournament');
        }
    };



    const handleStartTournament = async (tournamentId) => {
        try {
            await tournamentAPI.startTournament(tournamentId);
            alert('Tournament started successfully!');
            setTournaments(tournaments.map(t => 
                t._id === tournamentId ? { ...t, tournStatus: 'in progress' } : t
            ));
            await generateAndCreateGames(tournamentId);
            await loadActiveGames(tournamentId);
        } catch (err) {
            alert(err.message || 'Failed to start tournament');
        }
    };

    const handleEndTournament = async (tournamentId) => {
        try {
            await tournamentAPI.endTournament(tournamentId);
            alert('Tournament ended successfully!');
            setTournaments(tournaments.map(t => 
                t._id === tournamentId ? { ...t, tournStatus: 'completed' } : t
            ));
        } catch (err) {
            alert(err.message || 'Failed to end tournament');
        }
    };

    // Add player to tournament
    const handleAddPlayer = async (tournamentId) => {
        const userId = selectedUserByTournament[tournamentId];
        if (!userId) return alert('Select a user to add');
        try {
            await tournamentAPI.joinTournament(tournamentId, userId);
            alert('Player added to tournament');
            const { data } = await tournamentAPI.getTournament(tournamentId);
            setTournaments(prev => prev.map(t => t._id === tournamentId ? data : t));
        } catch (err) {
            alert(err.message || 'Failed to add player');
        }
    };

    // Generate pairings and create games via game-service
    const generateAndCreateGames = async (tournamentId) => {
        try {
            const { data } = await pairingAPI.generatePairings(tournamentId);
            const pairings = data?.pairings || [];
            for (const p of pairings) {
                const white = p.playerWhite?._id || p.playerWhite?.id || p.playerWhite;
                const black = p.playerBlack?._id || p.playerBlack?.id || p.playerBlack;
                if (white && black) {
                    await gameAPI.createFromPairing(white, black, tournamentId);
                }
            }
        } catch (err) {
            console.error('Generate/Create games error:', err);
        }
    };

    // Submit result for a game
    const finishGame = async (tournamentId, gameId, result) => {
        try {
            await gameAPI.submitGameResult(gameId, result);
            await loadActiveGames(tournamentId);
            // Try to create next games
            await generateAndCreateGames(tournamentId);
            await loadActiveGames(tournamentId);
        } catch (err) {
            alert(err.message || 'Failed to submit result');
        }
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



	return (
		<div>
			<div className="d-flex justify-content-between align-items-center mb-4">
				<h1>Admin Dashboard</h1>
				<span className="badge badge-success">Administrator</span>
			</div>

			{error && (
				<div className="alert alert-danger">
					{error}
				</div>
			)}

			{/* Navigation Tabs */}
			<div className="mb-4">
				<div className="d-flex gap-2">
					<button 
						onClick={() => setActiveTab('tournaments')}
						className={`btn ${activeTab === 'tournaments' ? 'btn-primary' : 'btn-secondary'}`}
					>
						Tournaments
					</button>
					<button 
						onClick={() => setActiveTab('create')}
						className={`btn ${activeTab === 'create' ? 'btn-primary' : 'btn-secondary'}`}
					>
						Create Tournament
					</button>
					<button 
						onClick={() => setActiveTab('users')}
						className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
					>
						Users
					</button>
					<button 
						onClick={() => setActiveTab('system')}
						className={`btn ${activeTab === 'system' ? 'btn-primary' : 'btn-secondary'}`}
					>
						System Health
					</button>
				</div>
			</div>

			{/* Tab Content */}
			{activeTab === 'tournaments' && (
				<div className="card">
					<div className="card-header">
						<h3 className="card-title">Tournament Management</h3>
					</div>
					<div>
						{loading ? (
							<div className="text-center">
								<div className="loading-spinner"></div>
								<p>Loading tournaments...</p>
							</div>
                            ) : (
                                    <>
                                    <table className="table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Status</th>
                                    <th>Location</th>
                                    <th>Players</th>
                                    <th>Start Date</th>
                                    <th>Add Player</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tournaments.map((tournament) => (
                                    <tr key={tournament._id}>
                                        <td>{tournament.name}</td>
                                        <td>{getStatusBadge(tournament.tournStatus)}</td>
                                        <td>{tournament.tournLocation}</td>
                                        <td>{tournament.participants.length} / {tournament.maxPlayers}</td>
                                        <td>{new Date(tournament.startDate).toLocaleDateString()}</td>
                                        <td>
                                            <div className="d-flex gap-2">
                                                <select
                                                    value={selectedUserByTournament[tournament._id] || ''}
                                                    onChange={(e) => setSelectedUserByTournament({
                                                        ...selectedUserByTournament,
                                                        [tournament._id]: e.target.value
                                                    })}
                                                >
                                                    <option value="">Select user</option>
                                                    {users.map(u => (
                                                        <option key={u._id} value={u._id}>{u.username}</option>
                                                    ))}
                                                </select>
                                                <button className="btn btn-sm btn-primary" onClick={() => handleAddPlayer(tournament._id)}>
                                                    Add
                                                </button>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="d-flex gap-2">
                                                {tournament.tournStatus === 'upcoming' && (
                                                    <button 
                                                        onClick={() => handleStartTournament(tournament._id)}
                                                        className="btn btn-sm btn-success"
                                                    >
                                                        Start
                                                    </button>
                                                )}
                                                {tournament.tournStatus === 'in progress' && (
                                                    <button 
                                                        onClick={() => handleEndTournament(tournament._id)}
                                                        className="btn btn-sm btn-warning"
                                                    >
                                                        End
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={() => loadActiveGames(tournament._id)}
                                                    className="btn btn-sm btn-secondary"
                                                >
                                                    Refresh Games
                                                </button>
                                                
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        
                        {tournaments.map((t) => (
                            <div key={t._id} className="mt-3">
                                <h4>{t.name} - Active Games</h4>
                                {Array.isArray(activeGamesByTournament[t._id]) && activeGamesByTournament[t._id].length > 0 ? (
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Game ID</th>
                                                <th>White</th>
                                                <th>Black</th>
                                                <th>Status</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {activeGamesByTournament[t._id].map(g => (
                                                <tr key={g._id}>
                                                    <td>{g._id}</td>
                                                    <td>{g.playerWhite?.username || g.playerWhite}</td>
                                                    <td>{g.playerBlack?.username || g.playerBlack}</td>
                                                    <td>{g.isFinished ? 'Finished' : 'Ongoing'}</td>
                                                    <td>
                                                        {!g.isFinished && (
                                                            <div className="d-flex gap-1">
                                                                <button className="btn btn-sm btn-success" onClick={() => finishGame(t._id, g._id, 'white')}>White wins</button>
                                                                <button className="btn btn-sm btn-dark" onClick={() => finishGame(t._id, g._id, 'black')}>Black wins</button>
                                                                <button className="btn btn-sm btn-secondary" onClick={() => finishGame(t._id, g._id, 'draw')}>Draw</button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <p className="text-muted">No active games</p>
                                )}
                            </div>
                        ))}
                        </>
                    )}
                </div>
            </div>
        )}

			{activeTab === 'create' && (
				<div className="card">
					<div className="card-header">
						<h3 className="card-title">Create New Tournament</h3>
					</div>
					<div>
						<form onSubmit={handleTournamentSubmit}>
							<div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
								<div className="form-group">
									<label htmlFor="name">Tournament Name</label>
									<input
										type="text"
										id="name"
										value={tournamentForm.name}
										onChange={(e) => setTournamentForm({...tournamentForm, name: e.target.value})}
										required
									/>
								</div>

								<div className="form-group">
									<label htmlFor="location">Location</label>
									<input
										type="text"
										id="location"
										value={tournamentForm.tournLocation}
										onChange={(e) => setTournamentForm({...tournamentForm, tournLocation: e.target.value})}
										required
									/>
								</div>

								<div className="form-group">
									<label htmlFor="startDate">Start Date</label>
									<input
										type="datetime-local"
										id="startDate"
										value={tournamentForm.startDate}
										onChange={(e) => setTournamentForm({...tournamentForm, startDate: e.target.value})}
										required
									/>
								</div>

								<div className="form-group">
									<label htmlFor="endDate">End Date</label>
									<input
										type="datetime-local"
										id="endDate"
										value={tournamentForm.endDate}
										onChange={(e) => setTournamentForm({...tournamentForm, endDate: e.target.value})}
										required
									/>
								</div>

								<div className="form-group">
									<label htmlFor="maxPlayers">Max Players</label>
									<input
										type="number"
										id="maxPlayers"
										value={tournamentForm.maxPlayers}
										onChange={(e) => setTournamentForm({...tournamentForm, maxPlayers: parseInt(e.target.value)})}
										min="2"
										max="1000"
										required
									/>
								</div>

								<div className="form-group">
									<label htmlFor="timeControl">Time Control</label>
									<input
										type="text"
										id="timeControl"
										value={tournamentForm.timeControl}
										onChange={(e) => setTournamentForm({...tournamentForm, timeControl: e.target.value})}
										placeholder="e.g., 5+3"
										required
									/>
								</div>
							</div>

							<div className="form-group">
								<label htmlFor="description">Description</label>
								<textarea
									id="description"
									value={tournamentForm.description}
									onChange={(e) => setTournamentForm({...tournamentForm, description: e.target.value})}
									rows="4"
								/>
							</div>

							<button type="submit" className="btn btn-primary">
								Create Tournament
							</button>
						</form>
					</div>
				</div>
			)}

            {activeTab === 'users' && (
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">User Management</h3>
                    </div>
                    <div>
                        {loading ? (
                            <div className="text-center">
                                <div className="loading-spinner"></div>
                                <p>Loading users...</p>
                            </div>
                        ) : (
                            <>
                            <form className="mb-3" onSubmit={async (e) => {
                                e.preventDefault();
                                try {
                                    await userAPI.addUser(newUser);
                                    alert('User created');
                                    setNewUser({ username: '', email: '', globalElo: 1200 });
                                    const res = await userAPI.getAll();
                                    setUsers(res.data?.users || []);
                                } catch (err) {
                                    alert(err.message || 'Failed to create user');
                                }
                            }}>
                                <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                                    <input type="text" placeholder="Username" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} required />
                                    <input type="email" placeholder="Email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required />
                                    <input type="number" placeholder="Global ELO" value={newUser.globalElo} onChange={(e) => setNewUser({ ...newUser, globalElo: parseInt(e.target.value || '0') })} />
                                    <button type="submit" className="btn btn-primary">Create User</button>
                                </div>
                            </form>
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Username</th>
                                        <th>Email</th>
                                        <th>Role</th>
                                        <th>Global ELO</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((user) => (
                                        <tr key={user._id}>
                                            <td>{user.username}</td>
                                            <td>{user.email}</td>
                                            <td>
                                                <span className={`badge ${user.role === 'admin' ? 'badge-success' : 'badge-primary'}`}>
                                                    {user.role}
                                                </span>
                                            </td>
                                            <td>{user.globalElo}</td>
                                            <td>
                                                <button className="btn btn-sm btn-danger" onClick={async () => {
                                                    if (!window.confirm('Delete this user?')) return;
                                                    try {
                                                        await userAPI.deleteUser(user._id);
                                                        setUsers(users.filter(u => u._id !== user._id));
                                                    } catch (err) {
                                                        alert(err.message || 'Failed to delete user');
                                                    }
                                                }}>
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            </>
                        )}
                    </div>
                </div>
            )}

			{activeTab === 'system' && (
				<div className="card">
					<div className="card-header">
						<h3 className="card-title">System Health</h3>
					</div>
					<div>
						{loading ? (
							<div className="text-center">
								<div className="loading-spinner"></div>
								<p>Loading system health...</p>
							</div>
						) : systemHealth ? (
								<div>
									<p><strong>Gateway Status:</strong> <span className="badge badge-success">{systemHealth.gateway}</span></p>
									<div className="mt-3">
										<h4>Services Status:</h4>
										<div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
											{Object.entries(systemHealth.services).map(([serviceName, service]) => (
												<div key={serviceName} className="card">
													<div className="card-header">
														<h5>{serviceName}</h5>
													</div>
													<div>
														<p><strong>Status:</strong> 
															<span className={`badge ${service.status === 'UP' ? 'badge-success' : 'badge-danger'}`}>
																{service.status}
															</span>
														</p>
														<p><strong>Response Time:</strong> {service.responseTime}ms</p>
														<p><strong>Last Check:</strong> {new Date(service.lastCheck).toLocaleString()}</p>
													</div>
												</div>
											))}
										</div>
									</div>
									<div className="mt-3">
										<p><strong>Summary:</strong> {systemHealth.summary?.up || 0} up, {systemHealth.summary?.down || 0} down</p>
									</div>
								</div>
							) : (
									<p className="text-muted">System health information not available</p>
								)}
					</div>
				</div>
			)}
		</div>
	);
};

export default AdminDashboard; 
