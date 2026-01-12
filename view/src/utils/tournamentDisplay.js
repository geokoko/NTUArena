import React from 'react';

export const statusBadge = (status) => {
	switch (status) {
		case 'upcoming':
			return <span className="badge bg-warning text-dark">Upcoming</span>;
		case 'in progress':
			return <span className="badge bg-success">In Progress</span>;
		case 'completed':
			return <span className="badge bg-secondary">Completed</span>;
		default:
			return <span className="badge bg-primary">{status || 'Unknown'}</span>;
	}
};

export const formatDate = (value) => {
	if (!value) return '—';
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
};

export const summarizeDescription = (value) => {
	if (!value) return 'No description provided.';
	return value.length > 160 ? `${value.slice(0, 160)}…` : value;
};

export const getDisplayName = (user = {}) => {
	const first = user?.profile?.firstName?.trim?.();
	const last = user?.profile?.lastName?.trim?.();
	const parts = [first, last].filter(Boolean);
	if (parts.length) return parts.join(' ');
	return user?.username || user?.email || 'Unknown';
};

