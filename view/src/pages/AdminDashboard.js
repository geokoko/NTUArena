import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { userAPI, healthAPI } from '../services/api';

const Badge = ({ kind = 'secondary', children }) => (
	<span className={`badge bg-${kind}`}>{children}</span>
);

const Spinner = () => (
	<div className="text-center my-4">
		<div className="spinner-border" role="status" />
	</div>
);

const getDisplayName = (user = {}) => {
	const first = user?.profile?.firstName?.trim?.();
	const last = user?.profile?.lastName?.trim?.();
	const parts = [first, last].filter(Boolean);
	if (parts.length) return parts.join(' ');
	return user?.username || user?.email || 'Unknown';
};

const AdminDashboard = () => {
	const [activeTab, setActiveTab] = useState('users');
	const [users, setUsers] = useState([]);
	const [usersLoading, setUsersLoading] = useState(false);
	const [usersError, setUsersError] = useState('');
	const [systemHealth, setSystemHealth] = useState(null);
	const [systemError, setSystemError] = useState('');

	const loadUsers = useCallback(async () => {
		setUsersLoading(true);
		setUsersError('');
		try {
			const res = await userAPI.getAll();
			const list = res.data?.users || res.data || [];
			setUsers(Array.isArray(list) ? list : []);
		} catch (err) {
			setUsersError(err.message || 'Failed to load users');
		} finally {
			setUsersLoading(false);
		}
	}, []);

	const loadSystem = useCallback(async () => {
		setSystemError('');
		try {
			const { data } = await healthAPI.checkHealth();
			setSystemHealth(data);
		} catch (err) {
			setSystemError(err.message || 'Failed to load system status');
		}
	}, []);

	useEffect(() => {
		if (activeTab === 'users') loadUsers();
		if (activeTab === 'system') loadSystem();
	}, [activeTab, loadUsers, loadSystem]);

	const deleteUser = async (userId) => {
		if (!window.confirm('Remove this user?')) return;
		await userAPI.deleteUser(userId);
		await loadUsers();
	};

	return (
		<div className="container my-4">
			<div className="mb-3 d-flex gap-2">
				<button
					className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-outline-primary'}`}
					onClick={() => setActiveTab('users')}
				>
					Users
				</button>
				<button
					className={`btn ${activeTab === 'system' ? 'btn-primary' : 'btn-outline-primary'}`}
					onClick={() => setActiveTab('system')}
				>
					System Health
				</button>
			</div>

			{activeTab === 'users' && (
				<div className="card">
					<div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
						<h4 className="m-0">User Management</h4>
						<div className="d-flex gap-2">
							<button className="btn btn-sm btn-outline-secondary" onClick={loadUsers}>Refresh</button>
							<Link to="/admin/users/new" className="btn btn-sm btn-primary">Register User</Link>
						</div>
					</div>
					<div className="card-body">
						{usersError && <div className="alert alert-danger">{usersError}</div>}
						{usersLoading ? (
							<Spinner />
						) : (
							<div className="table-responsive">
								<table className="table align-middle">
									<thead>
										<tr>
											<th>Name</th>
											<th>Email</th>
											<th>Role</th>
											<th>ELO</th>
											<th className="text-end">Actions</th>
										</tr>
									</thead>
									<tbody>
										{users.map((user) => (
											<tr key={user.id || user.email}>
												<td>{getDisplayName(user)}</td>
												<td>{user.email || '—'}</td>
												<td><Badge>{user.role || 'player'}</Badge></td>
												<td>{Number.isFinite(user.globalElo) ? Math.round(user.globalElo) : '—'}</td>
												<td className="text-end">
													<button
														className="btn btn-sm btn-outline-danger"
														onClick={() => deleteUser(user.id)}
													>
														Delete
													</button>
												</td>
											</tr>
										))}
										{users.length === 0 && (
											<tr>
												<td colSpan="5" className="text-center text-muted">
													No users found
												</td>
											</tr>
										)}
									</tbody>
								</table>
							</div>
						)}
					</div>
				</div>
			)}

			{activeTab === 'system' && (
				<div className="card">
					<div className="card-header d-flex justify-content-between align-items-center">
						<h4 className="m-0">System Health</h4>
						<button className="btn btn-sm btn-outline-secondary" onClick={loadSystem}>Refresh</button>
					</div>
					<div className="card-body">
						{systemError && <div className="alert alert-danger">{systemError}</div>}
						{!systemHealth ? (
							<p className="text-muted m-0">No data</p>
						) : (
							<pre className="bg-light p-3 rounded" style={{ maxHeight: 320, overflow: 'auto' }}>
								{JSON.stringify(systemHealth, null, 2)}
							</pre>
						)}
					</div>
				</div>
			)}
		</div>
	);
};

export default AdminDashboard;

