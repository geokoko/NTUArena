import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { healthAPI } from '../services/api';
import Spinner from '../components/Spinner';

const AdminDashboard = () => {
	const [systemHealth, setSystemHealth] = useState(null);
	const [systemError, setSystemError] = useState('');
	const [loading, setLoading] = useState(true);

	const loadSystem = useCallback(async () => {
		setSystemError('');
		setLoading(true);
		try {
			const { data } = await healthAPI.checkHealth();
			setSystemHealth(data);
		} catch (err) {
			setSystemError(err.message || 'Failed to load system status');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadSystem();
	}, [loadSystem]);

	return (
		<div className="container my-4">
			<div className="d-flex justify-content-between align-items-center mb-4">
				<h1 className="h3">Admin Dashboard</h1>
			</div>

			<div className="row g-4 mb-4">
				<div className="col-md-6 col-lg-4">
					<div className="card h-100">
						<div className="card-body">
							<h5 className="card-title">User Management</h5>
							<p className="card-text text-muted">Manage registered users, view profiles, and update roles.</p>
							<Link to="/users" className="btn btn-primary">Go to Users</Link>
						</div>
					</div>
				</div>
                <div className="col-md-6 col-lg-4">
					<div className="card h-100">
						<div className="card-body">
							<h5 className="card-title">Ongoing Games</h5>
							<p className="card-text text-muted">Monitor and manage active games.</p>
							<Link to="/admin/games" className="btn btn-primary">Manage Games</Link>
						</div>
					</div>
				</div>
                <div className="col-md-6 col-lg-4">
					<div className="card h-100">
						<div className="card-body">
							<h5 className="card-title">Tournaments</h5>
							<p className="card-text text-muted">Create and manage tournaments.</p>
							<Link to="/tournaments" className="btn btn-primary">Manage Tournaments</Link>
						</div>
					</div>
				</div>
			</div>

			<div className="card">
				<div className="card-header d-flex justify-content-between align-items-center">
					<h4 className="m-0 h5">System Health</h4>
					<button className="btn btn-sm btn-outline-secondary" onClick={loadSystem}>Refresh</button>
				</div>
				<div className="card-body">
					{systemError && <div className="alert alert-danger">{systemError}</div>}
					{loading ? (
						<Spinner />
					) : !systemHealth ? (
						<p className="text-muted m-0">No data available.</p>
					) : (
						<pre className="bg-light p-3 rounded mb-0" style={{ maxHeight: 320, overflow: 'auto' }}>
							{JSON.stringify(systemHealth, null, 2)}
						</pre>
					)}
				</div>
			</div>
		</div>
	);
};

export default AdminDashboard;
