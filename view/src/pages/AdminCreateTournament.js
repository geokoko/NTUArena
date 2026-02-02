import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { tournamentAPI } from '../services/api';
import './AdminCreateTournament.css';

const initialState = {
	name: '',
	tournLocation: '',
	startDate: '',
	endDate: '',
	timeControl: '',
	description: '',
	type: 'arena',
	maxPlayers: '100'
};

const AdminCreateTournament = () => {
	const navigate = useNavigate();
	const [form, setForm] = useState(initialState);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');

	const handleChange = (field) => (event) => {
		const value = event.target.value;
		setForm(prev => ({
			...prev,
			[field]: value
		}));
	};

	const toIso = (value) => {
		if (!value) return undefined;
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
	};

	const handleSubmit = async (event) => {
		event.preventDefault();
		setError('');
		setSubmitting(true);
		try {
			const maxPlayersValue = form.maxPlayers === '' ? undefined : Number(form.maxPlayers);
			if (maxPlayersValue !== undefined && (Number.isNaN(maxPlayersValue) || maxPlayersValue <= 0)) {
				throw new Error('Max players must be a positive number');
			}
			const payload = {
				name: form.name,
				tournLocation: form.tournLocation,
				startDate: toIso(form.startDate),
				endDate: toIso(form.endDate),
				timeControl: form.timeControl,
				description: form.description,
				type: form.type,
				maxPlayers: maxPlayersValue,
			};
			const response = await tournamentAPI.createTournament(payload);
			// Redirect to the created tournament's detail page
			const createdTournament = response.data?.tournament || response.data;
			const tournamentId = createdTournament?.id;
			if (tournamentId) {
				navigate(`/tournament/${tournamentId}`);
			} else {
				// Fallback to tournaments list if no ID returned
				navigate('/tournaments');
			}
		} catch (err) {
			setError(err.message || 'Failed to create tournament');
			setSubmitting(false);
		}
	};

	return (
		<div className="admin-create-tournament container my-4">
			<div className="admin-create-tournament__header mb-4 d-flex justify-content-between align-items-center">
				<Link to="/admin" className="btn btn-outline-secondary admin-create-tournament__back">Back to Dashboard</Link>
			</div>

			<div className="card admin-create-tournament__card">
				<div className="card-header admin-create-tournament__card-header h1">
					<h3> Create New Tournament </h3>
				</div>
				<div className="card-body admin-create-tournament__card-body">
					<p className="text-muted">Provide the core details below. Required fields are marked with *.</p>
					{error && <div className="alert alert-danger">{error}</div>}
					<form onSubmit={handleSubmit} className="row g-3 admin-create-tournament__form">
						<div className="col-md-6">
							<label className="form-label">Name *</label>
							<input
								type="text"
								className="form-control"
								placeholder="Spring Open 2024"
								value={form.name}
								onChange={handleChange('name')}
								required
							/>
						</div>
						<div className="col-md-6">
							<label className="form-label">Location</label>
							<input
								type="text"
								className="form-control"
								placeholder="Athens Chess Club"
								value={form.tournLocation}
								onChange={handleChange('tournLocation')}
							/>
						</div>
						<div className="col-md-6">
							<label className="form-label">Start Date *</label>
							<input
								type="datetime-local"
								className="form-control"
								value={form.startDate}
								onChange={handleChange('startDate')}
								required
							/>
						</div>
						<div className="col-md-6">
							<label className="form-label">End Date *</label>
							<input
								type="datetime-local"
								className="form-control"
								value={form.endDate}
								onChange={handleChange('endDate')}
								required
							/>
						</div>
						<div className="col-md-4">
							<label className="form-label">Time Control</label>
							<input
								type="text"
								className="form-control"
								placeholder="15+10 Rapid"
								value={form.timeControl}
								onChange={handleChange('timeControl')}
							/>
						</div>
						<div className="col-md-4">
							<label className="form-label">Format</label>
							<select
								className="form-select"
								value={form.type}
								onChange={handleChange('type')}
							>
								<option value="arena">Arena</option>
								<option value="swiss">Swiss (Coming soon!)</option>
								<option value="knockout">Knockout (Coming soon!)</option>
							</select>
						</div>
						<div className="col-md-4">
							<label className="form-label">Max Players</label>
							<input
								type="number"
								min="2"
								className="form-control"
								value={form.maxPlayers}
								onChange={handleChange('maxPlayers')}
							/>
						</div>
						<div className="col-12">
							<label className="form-label">Description</label>
							<textarea
								className="form-control"
								rows="4"
								placeholder="Short overview of the event..."
								value={form.description}
								onChange={handleChange('description')}
							/>
						</div>
						<div className="col-12">
							<button type="submit" className="btn btn-primary admin-create-tournament__submit" disabled={submitting}>
								{submitting ? 'Creating…' : 'Create Tournament'}
							</button>
							<Link to="/tournaments" className="btn btn-link admin-create-tournament__link">View Tournaments</Link>
						</div>
					</form>
				</div>
			</div>
		</div>
	);
};

export default AdminCreateTournament;
