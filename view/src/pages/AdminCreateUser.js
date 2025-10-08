import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { userAPI } from '../services/api';

const initialState = {
	username: '',
	email: '',
	password: '',
	globalElo: '1200',
	role: 'player'
};

const AdminCreateUser = () => {
	const [form, setForm] = useState(initialState);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');
	const [success, setSuccess] = useState('');

	const handleChange = (field) => (event) => {
		const value = event.target.value;
		setForm(prev => ({
			...prev,
			[field]: value
		}));
	};

	const handleSubmit = async (event) => {
		event.preventDefault();
		setError('');
		setSuccess('');
		setSubmitting(true);
		try {
			const globalEloValue = form.globalElo === '' ? undefined : Number(form.globalElo);
			if (globalEloValue !== undefined && Number.isNaN(globalEloValue)) {
				throw new Error('Global ELO must be a number');
			}
			const payload = {
				username: form.username,
				email: form.email,
				password: form.password || undefined,
				globalElo: globalEloValue,
				role: form.role,
			};
			await userAPI.addUser(payload);
			setSuccess('User created successfully.');
			setForm(initialState);
		} catch (err) {
			setError(err.message || 'Failed to create user');
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="container my-4">
			<div className="mb-4 d-flex justify-content-between align-items-center">
				<h1 className="m-0">Register User</h1>
				<Link to="/admin" className="btn btn-outline-secondary">Back to Admin</Link>
			</div>

			<div className="card">
				<div className="card-body">
					<p className="text-muted">Admins can create users manually for testing or onboarding.</p>
					{error && <div className="alert alert-danger">{error}</div>}
					{success && <div className="alert alert-success">{success}</div>}
					<form onSubmit={handleSubmit} className="row g-3">
						<div className="col-md-6">
							<label className="form-label">Username</label>
							<input
								type="text"
								className="form-control"
								placeholder="e.g. chess_master"
								value={form.username}
								onChange={handleChange('username')}
								required
							/>
						</div>
						<div className="col-md-6">
							<label className="form-label">Email</label>
							<input
								type="email"
								className="form-control"
								placeholder="player@example.com"
								value={form.email}
								onChange={handleChange('email')}
								required
							/>
						</div>
						<div className="col-md-6">
							<label className="form-label">Password</label>
							<input
								type="password"
								className="form-control"
								placeholder="Optional password"
								value={form.password}
								onChange={handleChange('password')}
							/>
							<small className="text-muted">If empty, backend defaults may apply.</small>
						</div>
						<div className="col-md-3">
							<label className="form-label">Global ELO</label>
							<input
								type="number"
								min="0"
								className="form-control"
								value={form.globalElo}
								onChange={handleChange('globalElo')}
							/>
						</div>
						<div className="col-md-3">
							<label className="form-label">Role</label>
							<select
								className="form-select"
								value={form.role}
								onChange={handleChange('role')}
							>
								<option value="player">Player</option>
								<option value="admin">Admin</option>
							</select>
						</div>
						<div className="col-12">
							<button type="submit" className="btn btn-primary" disabled={submitting}>
								{submitting ? 'Creating…' : 'Create User'}
							</button>
							<Link to="/users" className="btn btn-link">View Users</Link>
						</div>
					</form>
				</div>
			</div>
		</div>
	);
};

export default AdminCreateUser;
