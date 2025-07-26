import React, { useState, useEffect } from 'react';
import { tournamentAPI, userAPI, healthAPI } from '../services/api';
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

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        if (activeTab === 'tournaments') {
          // Simulate tournament data
          setTournaments([
            {
              _id: '1',
              name: 'Weekly Arena Championship',
              startDate: new Date().toISOString(),
              endDate: new Date(Date.now() + 3600000 * 3).toISOString(),
              tournLocation: 'Online',
              tournStatus: 'active',
              participants: ['user1', 'user2'],
              maxPlayers: 50
            },
            {
              _id: '2',
              name: 'Monthly Master Tournament',
              startDate: new Date(Date.now() + 86400000).toISOString(),
              endDate: new Date(Date.now() + 86400000 + 3600000 * 4).toISOString(),
              tournLocation: 'Chess Club',
              tournStatus: 'upcoming',
              participants: [],
              maxPlayers: 30
            }
          ]);
        } else if (activeTab === 'users') {
          // Simulate user data
          setUsers([
            { _id: '1', username: 'testuser', email: 'test@example.com', role: 'user', globalElo: 1500 },
            { _id: '2', username: 'admin', email: 'admin@example.com', role: 'admin', globalElo: 2000 }
          ]);
        } else if (activeTab === 'system') {
          const healthResponse = await healthAPI.checkServicesHealth();
          setSystemHealth(healthResponse.data);
        }
      } catch (err) {
        setError('Failed to load data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [activeTab]);

  const handleTournamentSubmit = async (e) => {
    e.preventDefault();
    try {
      await tournamentAPI.createTournament(tournamentForm);
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
      setActiveTab('tournaments');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create tournament');
    }
  };

  const handleDeleteTournament = async (tournamentId) => {
    if (window.confirm('Are you sure you want to delete this tournament?')) {
      try {
        await tournamentAPI.deleteTournament(tournamentId);
        alert('Tournament deleted successfully!');
        setTournaments(tournaments.filter(t => t._id !== tournamentId));
      } catch (err) {
        alert(err.response?.data?.error || 'Failed to delete tournament');
      }
    }
  };

  const handleStartTournament = async (tournamentId) => {
    try {
      await tournamentAPI.startTournament(tournamentId);
      alert('Tournament started successfully!');
      setTournaments(tournaments.map(t => 
        t._id === tournamentId ? { ...t, tournStatus: 'active' } : t
      ));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to start tournament');
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
      alert(err.response?.data?.error || 'Failed to end tournament');
    }
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
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Location</th>
                    <th>Players</th>
                    <th>Start Date</th>
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
                          {tournament.tournStatus === 'upcoming' && (
                            <button 
                              onClick={() => handleStartTournament(tournament._id)}
                              className="btn btn-sm btn-success"
                            >
                              Start
                            </button>
                          )}
                          {tournament.tournStatus === 'active' && (
                            <button 
                              onClick={() => handleEndTournament(tournament._id)}
                              className="btn btn-sm btn-warning"
                            >
                              End
                            </button>
                          )}
                          <button 
                            onClick={() => handleDeleteTournament(tournament._id)}
                            className="btn btn-sm btn-danger"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                        <button className="btn btn-sm btn-secondary">
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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