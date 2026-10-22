import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TournamentLogs from './TournamentLogs';
import { tournamentAPI } from '../services/api';

jest.mock('../services/api', () => ({ tournamentAPI: { getLogs: jest.fn() } }));
afterEach(() => { jest.clearAllMocks(); jest.useRealTimers(); });

test('completion events can be filtered and fresh logs arrive while the panel is open', async () => {
	jest.useFakeTimers();
	tournamentAPI.getLogs.mockResolvedValueOnce({ data: [] }).mockResolvedValue({ data: [
		{ id: 'completed', eventType: 'tournament.completed', message: 'Tournament completed.', createdAt: new Date().toISOString() },
	] });
	render(<TournamentLogs tournamentId="arena" />);
	await act(async () => {});
	expect(screen.queryByPlaceholderText('Round')).not.toBeInTheDocument();
	await act(async () => { jest.advanceTimersByTime(2000); });
	expect(screen.getByText('Tournament completed.')).toBeInTheDocument();
	fireEvent.change(screen.getByLabelText('Event type'), { target: { value: 'tournament.completed' } });
	await act(async () => {});
	expect(tournamentAPI.getLogs).toHaveBeenLastCalledWith('arena', { eventType: 'tournament.completed', limit: 150 });
});

test('an admin action can refresh logs immediately', async () => {
	tournamentAPI.getLogs.mockResolvedValue({ data: [] });
	const { rerender } = render(<TournamentLogs tournamentId="arena" refreshKey={0} />);
	await act(async () => {});
	rerender(<TournamentLogs tournamentId="arena" refreshKey={1} />);
	await act(async () => {});
	expect(tournamentAPI.getLogs).toHaveBeenCalledTimes(2);
});
