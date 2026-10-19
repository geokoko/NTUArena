import React from 'react';
import { render, screen } from '@testing-library/react';
import TournamentCountdown from './TournamentCountdown';

test('finishing explains that remaining games may finish', () => {
	render(<TournamentCountdown status="finishing" endDate="2099-01-01T00:00:00Z" />);
	expect(screen.getByText('Pairing closed')).toBeTruthy();
	expect(screen.getByText('Waiting for remaining games')).toBeTruthy();
});

test('an unscheduled tournament displays manual start and its duration', () => {
	render(<TournamentCountdown status="upcoming" durationMs={5400000} />);
	expect(screen.getByText('Waiting for admin to start')).toBeTruthy();
	expect(screen.getByText('duration: 1h 30m')).toBeTruthy();
});
