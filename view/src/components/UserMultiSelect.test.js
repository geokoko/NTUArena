import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import UserMultiSelect from './UserMultiSelect';

const users = ['Alice', 'Bob', 'Carol'].map((username, i) => ({ id: String(i + 1), username }));
const selectAll = () => fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
const add = () => fireEvent.click(screen.getByRole('button', { name: 'Add selected' }));

test('partial results show names and reasons and retain only unsuccessful selections for retry', async () => {
	const onAdd = jest.fn().mockResolvedValueOnce({
		added: [{ userId: '1' }], skipped: [{ userId: '2', reason: 'Tournament is full' }],
		errors: [{ userId: '3', error: 'User not found' }],
	}).mockResolvedValueOnce({ added: [{ userId: '2' }, { userId: '3' }], skipped: [], errors: [] });
	render(<UserMultiSelect users={users} registeredUserIds={[]} onAdd={onAdd} />);
	selectAll();
	add();
	expect(await screen.findByRole('status')).toHaveTextContent('1 added, 1 skipped, 1 failed.');
	expect(screen.getByText('Bob: Tournament is full')).toBeInTheDocument();
	expect(screen.getByText('Carol: User not found')).toBeInTheDocument();
	expect(screen.getByText('2 selected')).toBeInTheDocument();
	expect(screen.getByRole('option', { name: 'Alice' })).toHaveAttribute('aria-selected', 'false');
	add();
	await waitFor(() => expect(onAdd).toHaveBeenLastCalledWith(['2', '3']));
	await waitFor(() => expect(screen.getByText('0 selected')).toBeInTheDocument());
});

test('request failures display the error and preserve selection', async () => {
	const onAdd = jest.fn().mockRejectedValue(new Error('Server unavailable'));
	render(<UserMultiSelect users={users} registeredUserIds={[]} onAdd={onAdd} />);
	selectAll();
	add();
	expect(await screen.findByRole('alert')).toHaveTextContent('Server unavailable');
	expect(screen.getByText('3 selected')).toBeInTheDocument();
});

test('an unreadable response does not silently clear selection', async () => {
	render(<UserMultiSelect users={users} registeredUserIds={[]} onAdd={async () => undefined} />);
	selectAll();
	add();
	expect(await screen.findByRole('alert')).toHaveTextContent('Could not read registration results');
	expect(screen.getByText('3 selected')).toBeInTheDocument();
});

test('a refresh excludes newly registered users from the retry selection', async () => {
	const onAdd = jest.fn().mockResolvedValue({ added: [], skipped: [{ userId: '1', reason: 'User already in tournament' }], errors: [] });
	const { rerender } = render(<UserMultiSelect users={users} registeredUserIds={[]} onAdd={onAdd} />);
	fireEvent.click(screen.getByRole('option', { name: 'Alice' }));
	add();
	await screen.findByRole('status');
	rerender(<UserMultiSelect users={users} registeredUserIds={['1']} onAdd={onAdd} />);
	expect(screen.getByText('0 selected')).toBeInTheDocument();
	expect(screen.getByRole('option', { name: 'Alice registered' })).toHaveAttribute('aria-selected', 'false');
	expect(screen.getByRole('button', { name: 'Add selected' })).toBeDisabled();
});

test('pending registration disables repeat submissions', async () => {
	let finish;
	const onAdd = jest.fn(() => new Promise((resolve) => { finish = resolve; }));
	render(<UserMultiSelect users={users} registeredUserIds={[]} onAdd={onAdd} />);
	selectAll();
	add();
	expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled();
	fireEvent.click(screen.getByRole('button', { name: 'Adding…' }));
	expect(onAdd).toHaveBeenCalledTimes(1);
	finish({ added: users.map((user) => ({ userId: user.id })), skipped: [], errors: [] });
	await screen.findByRole('status');
});

test('plain clicks toggle multiple users without a modifier key', () => {
	render(<UserMultiSelect users={users} registeredUserIds={[]} onAdd={jest.fn()} />);
	fireEvent.click(screen.getByRole('option', { name: 'Alice' }));
	fireEvent.click(screen.getByRole('option', { name: 'Bob' }));
	expect(screen.getByText('2 selected')).toBeInTheDocument();
	fireEvent.click(screen.getByRole('option', { name: 'Alice' }));
	expect(screen.getByText('1 selected')).toBeInTheDocument();
	expect(screen.getByRole('option', { name: 'Bob' })).toHaveAttribute('aria-selected', 'true');
});
