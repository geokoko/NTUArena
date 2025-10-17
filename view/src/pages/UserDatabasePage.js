import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { userAPI } from '../services/api';
import './UserDatabasePage.css';

const getInitials = (username, email) => {
	const base = (username || email || '').trim();
	if (!base) return '??';
	const cleaned = base.replace(/[^a-zA-Z0-9 ]+/g, ' ');
	const parts = cleaned.split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '??';
	const firstWord = parts[0];
	const lastWord = parts[parts.length - 1];
	const first = firstWord.charAt(0).toUpperCase();
	const second = (parts.length > 1 ? lastWord.charAt(0) : firstWord.charAt(1)).toUpperCase() || '';
	const initials = `${first}${second}`.trim();
	return initials || first || '??';
};

const formatRoleLabel = (role) => {
	const text = (role || 'player').replace(/[_-]+/g, ' ').toLowerCase();
	return text.replace(/(^|\s)([a-z])/g, (_, space, char) => `${space}${char.toUpperCase()}`);
};

const getRoleSlug = (role) => (role || 'player').toLowerCase().replace(/[^a-z0-9]+/g, '-');

const formatElo = (value) => {
	if (value === null || value === undefined) return '—';
	const numeric = Number(value);
	if (Number.isNaN(numeric)) return '—';
	return Math.round(numeric);
};

const getSecondaryMeta = (createdAt, id) => {
	if (createdAt) {
		const date = new Date(createdAt);
		if (!Number.isNaN(date.getTime())) {
			return {
				label: 'Joined',
				value: date.toLocaleDateString(undefined, {
					month: 'short',
					day: 'numeric',
					year: 'numeric'
				}),
			};
		}
	}
	return {
		label: 'User ID',
		value: id ? `…${id}` : '—',
	};
};

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

	const sortedUsers = useMemo(() => {
		return [...users].sort((a, b) => {
			const nameA = (a?.username || a?.email || '').toLowerCase();
			const nameB = (b?.username || b?.email || '').toLowerCase();
			return nameA.localeCompare(nameB);
		});
	}, [users]);

	const summary = useMemo(() => {
		let adminCount = 0;
		let eloSum = 0;
		let eloEntries = 0;
		sortedUsers.forEach((user) => {
			if ((user?.role || '').toLowerCase() === 'admin') adminCount += 1;
			const numeric = Number(user?.globalElo);
			if (!Number.isNaN(numeric)) {
				eloSum += numeric;
				eloEntries += 1;
			}
		});
		return {
			total: sortedUsers.length,
			admins: adminCount,
			players: Math.max(sortedUsers.length - adminCount, 0),
			averageElo: eloEntries ? Math.round(eloSum / eloEntries) : null,
		};
	}, [sortedUsers]);

	return (
		<div className="user-database-page container my-4">
			<div className="user-database-page__header d-flex justify-content-between align-items-center mb-4">
				<h1 className="m-0">Registered Users</h1>
				<Link to="/admin/users/new" className="btn btn-primary user-database-page__create">Register User</Link>
			</div>

			{error && (
				<div className="alert alert-danger" role="alert">
					{error}
				</div>
			)}

			{loading ? (
				<div className="user-database-page__loading text-center text-muted py-5">Loading users...</div>
			) : (
					<div className="card user-database-page__card">
						<div className="user-database-page__summary">
							<div className="user-database-page__summary-item">
								<span className="user-database-page__summary-value">{summary.total}</span>
								<span className="user-database-page__summary-label">Total Users</span>
							</div>
							<div className="user-database-page__summary-item">
								<span className="user-database-page__summary-value">{summary.players}</span>
								<span className="user-database-page__summary-label">Players</span>
							</div>
							<div className="user-database-page__summary-item">
								<span className="user-database-page__summary-value">{summary.admins}</span>
								<span className="user-database-page__summary-label">Admins</span>
							</div>
							<div className="user-database-page__summary-item">
								<span className="user-database-page__summary-value">{summary.averageElo ?? '—'}</span>
								<span className="user-database-page__summary-label">Avg. ELO</span>
							</div>
						</div>

						{sortedUsers.length === 0 ? (
							<div className="user-database-page__empty">No registered users yet.</div>
						) : (
								<div className="user-database-page__list">
									{sortedUsers.map((user) => {
										const displayName = user.username || user.email || 'Unknown player';
										const initials = getInitials(user.username, user.email);
										const roleLabel = formatRoleLabel(user.role);
										const roleSlug = getRoleSlug(user.role);
										const shortId = user._id ? String(user._id).slice(-6) : '';
										const secondaryMeta = getSecondaryMeta(user.createdAt, shortId);
										return (
											<article key={user._id || user.email || displayName} className="user-card">
												<div className="user-card__header">
													<div className="user-card__avatar" aria-hidden="true">{initials}</div>
													<div className="user-card__identity">
														<span className="user-card__name">{displayName}</span>
														{user.email ? (
															<a className="user-card__email" href={`mailto:${user.email}`}>{user.email}</a>
														) : (
																<span className="user-card__email user-card__email--muted">No email provided</span>
															)}
													</div>
													<span className={`user-card__role user-card__role--${roleSlug}`}>{roleLabel}</span>
												</div>
												<div className="user-card__meta">
													<div className="user-card__stat">
														<span className="user-card__stat-label">Global ELO</span>
														<span className="user-card__stat-value">{formatElo(user.globalElo)}</span>
													</div>
													<div className="user-card__stat">
														<span className="user-card__stat-label">{secondaryMeta.label}</span>
														<span className="user-card__stat-value">{secondaryMeta.value}</span>
													</div>
												</div>
											</article>
										);
									})}
								</div>
							)}
					</div>
				)}

			<div className="mt-4 user-database-page__footer">
				<Link to="/admin" className="btn btn-outline-secondary user-database-page__back">Back to Admin Dashboard</Link>
			</div>
		</div>
	);
};

export default UserDatabasePage;
