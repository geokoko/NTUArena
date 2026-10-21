import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminCreateTournament from './AdminCreateTournament';
import { tournamentAPI } from '../services/api';

jest.mock('react-router-dom', () => ({
	Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
	useNavigate: () => jest.fn(),
}));
jest.mock('../services/api', () => ({ tournamentAPI: { createTournament: jest.fn() } }));

test('a creation error is announced and focused even when submitted from the bottom', async () => {
	tournamentAPI.createTournament.mockRejectedValue(new Error('Creation unavailable'));
	render(<AdminCreateTournament />);
	fireEvent.change(screen.getByPlaceholderText('Spring Open 2024'), { target: { value: 'Arena' } });
	fireEvent.click(screen.getByRole('button', { name: 'Create Tournament' }));
	const alert = await screen.findByRole('alert');
	expect(alert).toHaveTextContent('Creation unavailable');
	expect(alert).toHaveFocus();
});
