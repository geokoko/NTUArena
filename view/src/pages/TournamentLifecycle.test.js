import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TournamentDetail from './TournamentDetail';
import TournamentManage from './TournamentManage';
import { tournamentAPI, gameAPI, userAPI } from '../services/api';

jest.mock('react-router-dom', () => ({
	Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
	useParams: () => ({ id: 'arena' }), useNavigate: () => jest.fn(),
}));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin' }, isAdmin: true }) }));
jest.mock('../components/TournamentCountdown', () => () => null);
jest.mock('../components/TournamentLogs', () => () => null);
jest.mock('../services/api', () => ({
	tournamentAPI: {
		getTournament: jest.fn(), getTournamentPlayers: jest.fn(), getTournamentGames: jest.fn(),
		getTournamentStandings: jest.fn(),
	},
	userAPI: { getAll: jest.fn() },
	gameAPI: { submitGameResult: jest.fn(), cancelGame: jest.fn() },
}));

let current;
let games;
beforeEach(() => {
	current = { id: 'arena', name: 'Arena', tournStatus: 'upcoming', participants: [], maxPlayers: 10, settleMs: 5000 };
	games = [];
	tournamentAPI.getTournament.mockImplementation(async () => ({ data: { ...current } }));
	tournamentAPI.getTournamentGames.mockImplementation(async () => ({ data: [...games] }));
	tournamentAPI.getTournamentPlayers.mockResolvedValue({ data: [] });
	tournamentAPI.getTournamentStandings.mockResolvedValue({ data: [] });
	userAPI.getAll.mockResolvedValue({ data: [{ id: 'alice', username: 'Alice' }] });
});
afterEach(() => { jest.clearAllMocks(); jest.useRealTimers(); });

test.each([TournamentDetail, TournamentManage])('%p picks up automatic lifecycle transitions', async (Page) => {
	jest.useFakeTimers();
	render(<Page />);
	await screen.findAllByText('Upcoming');
	current.tournStatus = 'in progress';
	await act(async () => { jest.advanceTimersByTime(5000); });
	expect(screen.queryByText('Upcoming')).not.toBeInTheDocument();
	expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0);
	current.tournStatus = 'completed';
	await act(async () => { jest.advanceTimersByTime(5000); });
	expect(screen.getAllByText('Completed').length).toBeGreaterThan(0);
});

test('management polling preserves an unsaved pairing setting', async () => {
	jest.useFakeTimers();
	render(<TournamentManage />);
	const input = await screen.findByLabelText('Pairing settle window (seconds)');
	fireEvent.change(input, { target: { value: '42' } });
	await act(async () => { jest.advanceTimersByTime(2000); });
	expect(input).toHaveValue(42);
});

test.each(['result', 'cancel'])('detail updates completion immediately after the last %s', async (action) => {
	current.tournStatus = 'finishing';
	games = [{ id: 'game', isFinished: false, boardNumber: 1, playerWhite: { id: 'white', name: 'White' }, playerBlack: { id: 'black', name: 'Black' } }];
	const settle = async () => { current.tournStatus = 'completed'; games = []; return { data: {} }; };
	gameAPI.submitGameResult.mockImplementation(settle);
	gameAPI.cancelGame.mockImplementation(settle);
	render(<TournamentDetail />);
	fireEvent.click(await screen.findByRole('button', { name: /Active Games/ }));
	fireEvent.click(screen.getByRole('checkbox'));
	fireEvent.click(await screen.findByRole('button', { name: action === 'result' ? /White wins/ : /Cancel/ }));
	await waitFor(() => expect(screen.getAllByText('Completed').length).toBeGreaterThan(0));
	expect(screen.queryByText('Finishing')).not.toBeInTheDocument();
});

test.each([TournamentDetail, TournamentManage])('%p keeps withdrawn users unavailable for registration', async (Page) => {
	tournamentAPI.getTournamentPlayers.mockResolvedValue({ data: [{ id: 'player', userId: 'alice', name: 'Alice', status: 'withdrawn' }] });
	render(<Page />);
	if (Page === TournamentDetail) fireEvent.click(await screen.findByRole('button', { name: 'Manage' }));
	expect(await screen.findByRole('option', { name: 'Alice registered' })).toBeDisabled();
});

test.each(['overview', 'active-games'])('the %s tab leaves API budget for tournament actions', async (tab) => {
	jest.useFakeTimers();
	current.tournStatus = 'in progress';
	render(<TournamentDetail />);
	await screen.findAllByText('In Progress');
	if (tab === 'active-games') fireEvent.click(screen.getByRole('button', { name: /Active Games/ }));
	for (let second = 0; second < 62; second++) {
		await act(async () => { jest.advanceTimersByTime(1000); });
	}
	const reads = ['getTournament', 'getTournamentPlayers', 'getTournamentGames', 'getTournamentStandings']
		.reduce((total, method) => total + tournamentAPI[method].mock.calls.length, 0);
	// The production API allows 240 requests/minute. One open page must
	// leave room for result submissions, actions, and their refreshes.
	expect(reads).toBeLessThanOrEqual(120);
});
