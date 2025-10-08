import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { userAPI } from '../services/api';

const UserDatabasePage = () => {
	const [users, setUsers] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	useEffect(() => {
		let ignore = false;
		const fetchUsers = async () => {
			setLoading(true);
			setError('');
			try {
				const res = await userAPI.getAll();
				const list = res.data?.users || res.data || [];
				if (!ignore) setUsers(Array.isArray(list) ? list : []);
			} catch (err) {
				if (!ignore) setError(err.message || 'Failed to load users');
			} finally {
				if (!ignore) setLoading(false);
			}
		};
		fetchUsers();
		return () => { ignore = true; };
	}, []);

	return (
		<div className="container my-4">
			<div className="d-flex justify-content-between align-items-center mb-4">
				<h1 className="m-0">Registered Users</h1>
				<Link to="/admin/users/new" className="btn btn-primary">Register User</Link>
			</div>

			{error && (
				<div className="alert alert-danger" role="alert">
					{error}
				</div>
			)}

			{loading ? (
				<div className="text-center text-muted py-5">Loading users...</div>
			) : (
				<div className="card">
					<div className="table-responsive">
						<table className="table table-striped align-middle mb-0">
							<thead>
								<tr>
									<th scope="col">Username</th>
									<th scope="col">Email</th>
									<th scope="col">Global ELO</th>
									<th scope="col">Role</th>
								</tr>
							</thead>
							<tbody>
								{users.length === 0 ? (
									<tr>
										<td colSpan="4" className="text-center text-muted py-3">No registered users yet.</td>
									</tr>
								) : users.map(user => (
									<tr key={user._id}>
										<td>{user.username || '—'}</td>
										<td>{user.email || '—'}</td>
										<td>{user.globalElo ?? '—'}</td>
										<td>
											<span className="badge bg-secondary text-uppercase">{(user.role || 'player')}</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}

			<div className="mt-4">
				<Link to="/admin" className="btn btn-outline-secondary">Back to Admin Dashboard</Link>
			</div>
		</div>
	);
};

export default UserDatabasePage;
