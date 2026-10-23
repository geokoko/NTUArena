import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import TournamentDetail from './TournamentDetail';
import TournamentManage from './TournamentManage';
import { INPUT_PROTECTION_MS } from '../components/GameResultDialog';
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
	gameAPI: { submitGameResult: jest.fn(), correctGameResult: jest.fn(), cancelGame: jest.fn() },
}));

const skipInputProtection = () => {
	const now = Date.now();
	jest.spyOn(Date, 'now').mockReturnValue(now + INPUT_PROTECTION_MS);
};

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
afterEach(() => { jest.restoreAllMocks(); jest.clearAllMocks(); jest.useRealTimers(); });

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
	jest.spyOn(window, 'confirm').mockReturnValue(true);
	render(<TournamentDetail />);
	fireEvent.click(await screen.findByRole('button', { name: /Active Games/ }));
	fireEvent.click(screen.getByRole('checkbox'));
	fireEvent.click(await screen.findByRole('button', { name: action === 'result' ? 'White wins' : /Cancel/ }));
	if (action === 'result') {
		expect(gameAPI.submitGameResult).not.toHaveBeenCalled();
		skipInputProtection();
		fireEvent.click(screen.getByRole('button', { name: 'Confirm 1-0' }));
	}
	await waitFor(() => expect(screen.getAllByText('Completed').length).toBeGreaterThan(0));
	expect(screen.queryByText('Finishing')).not.toBeInTheDocument();
	expect(window.confirm).toHaveBeenCalledTimes(action === 'cancel' ? 1 : 0);
});

test('declining the cancel confirmation keeps the game', async () => {
	current.tournStatus = 'in progress';
	games = [{ id: 'game', isFinished: false, boardNumber: 1, playerWhite: { id: 'white', name: 'White' }, playerBlack: { id: 'black', name: 'Black' } }];
	jest.spyOn(window, 'confirm').mockReturnValue(false);
	render(<TournamentDetail />);
	fireEvent.click(await screen.findByRole('button', { name: /Active Games/ }));
	fireEvent.click(screen.getByRole('checkbox'));
	fireEvent.click(await screen.findByRole('button', { name: /Cancel/ }));
	expect(window.confirm).toHaveBeenCalledTimes(1);
	expect(gameAPI.cancelGame).not.toHaveBeenCalled();
});

test('detail history lists the latest results first and corrects a recorded result', async () => {
	current.tournStatus = 'in progress';
	const finished = (id, boardNumber, startedAt, finishedAt, white, black) => ({
		id, boardNumber, startedAt, finishedAt, isFinished: true, resultColor: 'white',
		playerWhite: { id: `${id}-w`, name: white }, playerBlack: { id: `${id}-b`, name: black },
	});
	games = [
		finished('short', 1, '2026-10-23T10:30:00Z', '2026-10-23T10:40:00Z', 'Ann', 'Bob'),
		finished('long', 2, '2026-10-23T10:00:00Z', '2026-10-23T10:50:00Z', 'Cat', 'Dan'),
		{ ...finished('void', 3, '2026-10-23T09:00:00Z', '2026-10-23T09:05:00Z', 'Eve', 'Fay'), resultColor: null, isCancelled: true },
	];
	gameAPI.correctGameResult.mockImplementation(async (gameId, result) => {
		games = games.map((game) => (game.id === gameId ? { ...game, resultColor: result } : game));
		return { data: {} };
	});
	render(<TournamentDetail />);
	fireEvent.click(await screen.findByRole('button', { name: 'Game History' }));

	const rows = screen.getAllByRole('row').slice(1);
	expect(rows.map((row) => row.cells[0].textContent)).toEqual(['#2', '#1', '#3']);
	expect(screen.getAllByRole('button', { name: 'Edit result' })).toHaveLength(2);

	fireEvent.click(within(rows[1]).getByRole('button', { name: 'Edit result' }));
	expect(screen.getByRole('dialog', { name: 'Correct result' })).toHaveTextContent('Board 1');
	fireEvent.click(screen.getByRole('button', { name: /Bob wins/ }));
	skipInputProtection();
	fireEvent.click(screen.getByRole('button', { name: 'Change to 0-1' }));

	await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
	expect(gameAPI.correctGameResult).toHaveBeenCalledWith('short', 'black');
	expect(within(screen.getAllByRole('row')[2]).getByText('0-1')).toBeInTheDocument();
});

test('management page keeps the result dialog open when saving fails', async () => {
	current.tournStatus = 'in progress';
	games = [{ id: 'game', isFinished: false, boardNumber: 1, playerWhite: { id: 'white', name: 'Ann' }, playerBlack: { id: 'black', name: 'Bob' } }];
	gameAPI.submitGameResult.mockRejectedValue({ status: 409, message: 'Game with ID: game already finished with result black' });
	render(<TournamentManage />);

	fireEvent.click(await screen.findByRole('button', { name: 'White wins' }));
	skipInputProtection();
	fireEvent.click(screen.getByRole('button', { name: 'Confirm 1-0' }));

	expect(await screen.findByRole('alert')).toHaveTextContent('already finished with result black');
	expect(screen.getByRole('dialog', { name: 'Confirm result' })).toBeInTheDocument();
	expect(gameAPI.submitGameResult).toHaveBeenCalledWith('game', 'white');
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
