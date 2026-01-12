import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { userAPI } from '../services/api';
import Card from '../components/Card';
import Spinner from '../components/Spinner';
import CSVImport from '../components/CSVImport';
import './UserDatabasePage.css';

const USER_CSV_TEMPLATE = `username,email,role,globalElo,firstName,lastName
player1,player1@example.com,player,1200,John,Doe
player2,player2@example.com,player,1100,Jane,Smith`;

const getInitials = (user) => {
	const first = user?.profile?.firstName?.trim?.();
	const last = user?.profile?.lastName?.trim?.();
	const parts = [first, last].filter(Boolean);
	if (parts.length) {
		const [firstPart, secondPart] = parts;
		const primary = firstPart?.charAt(0)?.toUpperCase?.() || '';
		const secondary = (secondPart ?? firstPart)?.charAt?.(0)?.toUpperCase?.() || '';
		const combined = `${primary}${secondary}`.trim();
		if (combined) return combined;
	}

	const fallback = (user?.username || user?.email || '').trim();
	if (!fallback) return '??';
	const cleaned = fallback.replace(/[^a-zA-Z0-9 ]+/g, ' ');
	const segments = cleaned.split(/\s+/).filter(Boolean);
	if (segments.length === 0) return '??';
	const firstWord = segments[0];
	const lastWord = segments[segments.length - 1];
	const primary = firstWord.charAt(0).toUpperCase();
	const secondary = (segments.length > 1 ? lastWord.charAt(0) : firstWord.charAt(1)).toUpperCase() || '';
	const initials = `${primary}${secondary}`.trim();
	return initials || primary || '??';
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
		label: 'User Ref',
		value: id ? `…${String(id).slice(-6)}` : '—',
	};
};

const UserDatabasePage = () => {
	const [users, setUsers] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [showImport, setShowImport] = useState(false);

	const fetchUsers = useCallback(async () => {
		setLoading(true);
		setError('');
		try {
			const res = await userAPI.getAll();
			const list = res.data?.users || res.data || [];
			setUsers(Array.isArray(list) ? list : []);
		} catch (err) {
			setError(err.message || 'Failed to load users');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchUsers();
	}, [fetchUsers]);

	const handleImport = useCallback(async (csvText) => {
		const res = await userAPI.importCSV(csvText);
		// Refresh user list after import
		if (res.data?.created > 0) {
			fetchUsers();
		}
		return res.data;
	}, [fetchUsers]);

	const sortedUsers = useMemo(() => {
		const extractName = (user) => {
			const first = user?.profile?.firstName?.trim?.();
			const last = user?.profile?.lastName?.trim?.();
			const parts = [first, last].filter(Boolean);
			if (parts.length) return parts.join(' ').toLowerCase();
			return (user?.username || user?.email || '').toLowerCase();
		};
		return [...users].sort((a, b) => extractName(a).localeCompare(extractName(b)));
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
				<div className="d-flex gap-2">
					<Link to="/admin/users/new" className="btn btn-primary user-database-page__create">Register User</Link>
					<button
						type="button"
						className={`btn ${showImport ? 'btn-secondary' : 'btn-outline-secondary'}`}
						onClick={() => setShowImport(!showImport)}
					>
						{showImport ? 'Hide Import' : 'Import from CSV'}
					</button>
				</div>
			</div>

			{showImport && (
				<Card className="mb-4">
					<h5 className="mb-3">Import Users from CSV</h5>
					<CSVImport
						type="users"
						onImport={handleImport}
						templateContent={USER_CSV_TEMPLATE}
						templateFilename="users_template.csv"
					/>
				</Card>
			)}

			{error && (
				<div className="alert alert-danger" role="alert">
					{error}
				</div>
			)}

			{loading ? (
				<Spinner text="Loading users..." className="user-database-page__loading" />
			) : (
					<Card className="user-database-page__card">
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
										const displayName = [user?.profile?.firstName, user?.profile?.lastName]
											.filter(Boolean)
											.join(' ') || user.username || user.email || 'Unknown player';
										const initials = getInitials(user);
										const roleLabel = formatRoleLabel(user.role);
										const roleSlug = getRoleSlug(user.role);
										const secondaryMeta = getSecondaryMeta(user.createdAt, user.id);
										return (
											<article key={user.id || user.email || displayName} className="user-card">
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
					</Card>
				)}

			<div className="mt-4 user-database-page__footer">
				<Link to="/admin" className="btn btn-outline-secondary user-database-page__back">Back to Admin Dashboard</Link>
			</div>
		</div>
	);
};

export default UserDatabasePage;
