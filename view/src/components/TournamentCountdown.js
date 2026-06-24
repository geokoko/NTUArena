import React, { useEffect, useMemo, useState } from 'react';
import './TournamentCountdown.css';

const formatDuration = (ms) => {
	const totalSeconds = Math.max(Math.floor(ms / 1000), 0);
	const days = Math.floor(totalSeconds / 86400);
	const hours = Math.floor((totalSeconds % 86400) / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const hhmmss = [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
	return days > 0 ? `${days}d ${hhmmss}` : hhmmss;
};

const formatPlannedDuration = (durationMs) => {
	if (!durationMs) return 'not set';
	const minutesTotal = Math.round(durationMs / 60000);
	const hours = Math.floor(minutesTotal / 60);
	const minutes = minutesTotal % 60;
	return `${hours ? `${hours}h ` : ''}${minutes}m`.trim();
};

const TournamentCountdown = ({ endDate, status, scheduledStartDate, durationMs }) => {
	const [now, setNow] = useState(Date.now());

	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);

	const state = useMemo(() => {
		const normalizedStatus = String(status || '').toLowerCase();
		if (normalizedStatus === 'completed') {
			return { label: 'Ended', value: null };
		}
		if (normalizedStatus === 'upcoming') {
			if (!scheduledStartDate) {
				return { label: 'Waiting for admin to start', value: `duration: ${formatPlannedDuration(durationMs)}` };
			}
			const startMs = new Date(scheduledStartDate).getTime();
			return { label: 'Starts in', value: formatDuration(startMs - now) };
		}
		if (normalizedStatus === 'in progress' || normalizedStatus === 'finishing') {
			if (!endDate) return { label: 'Ends in', value: 'pending' };
			const endMs = new Date(endDate).getTime();
			return { label: normalizedStatus === 'finishing' ? 'Pairing closed' : 'Ends in', value: formatDuration(endMs - now) };
		}
		return { label: 'Schedule', value: formatPlannedDuration(durationMs) };
	}, [durationMs, endDate, now, scheduledStartDate, status]);

	return (
		<div className="tournament-countdown" aria-live="polite">
			<span className="tournament-countdown__label">{state.label}</span>
			{state.value && <span className="tournament-countdown__value">{state.value}</span>}
		</div>
	);
};

export default TournamentCountdown;
