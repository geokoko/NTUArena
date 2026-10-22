import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TournamentDetail from './TournamentDetail';
import TournamentManage from './TournamentManage';
import { tournamentAPI, userAPI } from '../services/api';

jest.mock('react-router-dom', () => ({
	Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
	useParams: () => ({ id: 'arena' }), useNavigate: () => jest.fn(),
}));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin' }, isAdmin: true }) }));
jest.mock('../components/TournamentLogs', () => () => null);
jest.mock('../components/TournamentCountdown', () => () => null);
jest.mock('../services/api', () => ({
	tournamentAPI: {
		getTournament: jest.fn(), getTournamentPlayers: jest.fn(), getTournamentGames: jest.fn(),
		getTournamentStandings: jest.fn(), bulkAddPlayers: jest.fn(),
	},
	userAPI: { getAll: jest.fn() }, gameAPI: {},
}));

beforeEach(() => {
	tournamentAPI.getTournament.mockResolvedValue({ data: { id: 'arena', name: 'Arena', tournStatus: 'upcoming', participants: [], maxPlayers: 10 } });
	for (const name of ['getTournamentPlayers', 'getTournamentGames', 'getTournamentStandings']) {
		tournamentAPI[name].mockResolvedValue({ data: [] });
	}
	userAPI.getAll.mockResolvedValue({ data: [{ id: 'alice', username: 'Alice' }, { id: 'bob', username: 'Bob' }] });
});
afterEach(() => jest.clearAllMocks());

async function openUsers(Page) {
	render(<Page />);
	if (Page === TournamentDetail) fireEvent.click(await screen.findByRole('button', { name: 'Manage' }));
	await screen.findByRole('option', { name: 'Alice' });
	fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
}

describe.each([['detail management tab', TournamentDetail], ['management page', TournamentManage]])('%s', (_, Page) => {
	test('passes bulk results through and retries only unsuccessful users', async () => {
		tournamentAPI.bulkAddPlayers.mockResolvedValue({ data: {
			added: [{ userId: 'alice' }], skipped: [{ userId: 'bob', reason: 'Tournament is full' }], errors: [],
		} });
		await openUsers(Page);
		fireEvent.click(screen.getByRole('button', { name: 'Add selected' }));
		expect(await screen.findByRole('status')).toHaveTextContent('1 added, 1 skipped, 0 failed.');
		expect(screen.getByText('Bob: Tournament is full')).toBeInTheDocument();
		expect(screen.getByText('1 selected')).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: 'Add selected' }));
		await waitFor(() => expect(tournamentAPI.bulkAddPlayers).toHaveBeenLastCalledWith('arena', ['bob']));
		await waitFor(() => expect(screen.getByRole('button', { name: 'Add selected' })).toBeEnabled());
	});

	test('shows request failures and keeps the original selection', async () => {
		tournamentAPI.bulkAddPlayers.mockRejectedValue(new Error('Registration unavailable'));
		await openUsers(Page);
		fireEvent.click(screen.getByRole('button', { name: 'Add selected' }));
		expect(await screen.findByRole('alert')).toHaveTextContent('Registration unavailable');
		expect(screen.getByText('2 selected')).toBeInTheDocument();
	});
});
