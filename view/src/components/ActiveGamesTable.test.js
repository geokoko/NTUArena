import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ActiveGamesTable, { arrangeBoards } from './ActiveGamesTable';
import { INPUT_PROTECTION_MS } from './GameResultDialog';

const game = (id, boardNumber, white, black, startedAt = '2026-10-23T10:00:00Z') => ({
	id,
	boardNumber,
	startedAt,
	isFinished: false,
	playerWhite: { id: `${id}-w`, name: white },
	playerBlack: { id: `${id}-b`, name: black },
});

const boardRows = () => screen.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0].textContent);
const rowFor = (name) => screen.getByText(name).closest('tr');
const skipInputProtection = () => {
	const now = Date.now();
	jest.spyOn(Date, 'now').mockReturnValue(now + INPUT_PROTECTION_MS);
};

afterEach(() => jest.restoreAllMocks());

test('arrangeBoards keeps free boards as placeholders and appends unnumbered games', () => {
	const later = game('late', null, 'E', 'F', '2026-10-23T11:00:00Z');
	const earlier = game('early', undefined, 'G', 'H', '2026-10-23T09:00:00Z');
	const rows = arrangeBoards([game('three', 3, 'A', 'B'), later, game('one', 1, 'C', 'D'), earlier]);

	expect(rows.map(({ board, game: g }) => [board, g?.id ?? null])).toEqual([
		[1, 'one'], [2, null], [3, 'three'], [null, 'early'], [null, 'late'],
	]);
});

test('a game keeps its row while other boards finish and new pairings arrive', () => {
	const props = { canManage: true, onSubmitResult: jest.fn(), onCancelGame: jest.fn() };
	const { rerender } = render(
		<ActiveGamesTable {...props} games={[game('g1', 1, 'Ann', 'Bob'), game('g2', 2, 'Cat', 'Dan'), game('g3', 3, 'Eve', 'Fay')]} />
	);
	const position = () => screen.getAllByRole('row').indexOf(rowFor('Eve'));
	const before = position();

	rerender(<ActiveGamesTable {...props} games={[game('g2', 2, 'Cat', 'Dan'), game('g3', 3, 'Eve', 'Fay')]} />);
	expect(position()).toBe(before);
	expect(boardRows()).toEqual(['#1', '#2', '#3']);
	expect(within(screen.getAllByRole('row')[1]).getByText('Free')).toBeInTheDocument();

	rerender(<ActiveGamesTable {...props} games={[game('g3', 3, 'Eve', 'Fay'), game('g4', 1, 'Gus', 'Hal'), game('g2', 2, 'Cat', 'Dan')]} />);
	expect(position()).toBe(before);
	expect(rowFor('Gus')).toHaveClass('active-games__row--new');
	expect(rowFor('Eve')).not.toHaveClass('active-games__row--new');
});

test('the confirmed result goes to the game that was clicked, even after the list changes', async () => {
	const onSubmitResult = jest.fn().mockResolvedValue();
	const props = { canManage: true, onSubmitResult, onCancelGame: jest.fn() };
	const { rerender } = render(<ActiveGamesTable {...props} games={[game('g1', 1, 'Ann', 'Bob'), game('g2', 2, 'Cat', 'Dan')]} />);

	fireEvent.click(within(rowFor('Cat')).getByRole('button', { name: 'White wins' }));
	const dialog = screen.getByRole('dialog', { name: 'Confirm result' });
	expect(dialog).toHaveTextContent('Board 2');
	expect(within(dialog).getByRole('button', { name: /Cat wins/ })).toHaveAttribute('aria-pressed', 'true');

	// Board 2 is settled elsewhere and re-paired while the dialog is open.
	rerender(<ActiveGamesTable {...props} games={[game('g1', 1, 'Ann', 'Bob'), game('g5', 2, 'Ivy', 'Jon')]} />);
	fireEvent.click(within(dialog).getByRole('button', { name: /Draw/ }));
	skipInputProtection();
	fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm ½-½' }));

	await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
	expect(onSubmitResult).toHaveBeenCalledTimes(1);
	expect(onSubmitResult).toHaveBeenCalledWith('g2', 'draw');
});

test('a confirm click right after opening is ignored', async () => {
	const onSubmitResult = jest.fn().mockResolvedValue();
	render(<ActiveGamesTable canManage games={[game('g1', 1, 'Ann', 'Bob')]} onSubmitResult={onSubmitResult} onCancelGame={jest.fn()} />);

	fireEvent.click(screen.getByRole('button', { name: 'Black wins' }));
	fireEvent.click(screen.getByRole('button', { name: 'Confirm 0-1' }));
	fireEvent.mouseDown(document.querySelector('.result-dialog__backdrop'));
	expect(onSubmitResult).not.toHaveBeenCalled();
	expect(screen.getByRole('dialog')).toBeInTheDocument();

	skipInputProtection();
	fireEvent.click(screen.getByRole('button', { name: 'Confirm 0-1' }));
	expect(onSubmitResult).toHaveBeenCalledWith('g1', 'black');
	await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('a failed save keeps the dialog open with the error', async () => {
	const onSubmitResult = jest.fn().mockRejectedValue({ message: 'Game with ID: g1 already finished with result white' });
	render(<ActiveGamesTable canManage games={[game('g1', 1, 'Ann', 'Bob')]} onSubmitResult={onSubmitResult} onCancelGame={jest.fn()} />);

	fireEvent.click(screen.getByRole('button', { name: 'White wins' }));
	skipInputProtection();
	fireEvent.click(screen.getByRole('button', { name: 'Confirm 1-0' }));

	expect(await screen.findByRole('alert')).toHaveTextContent('already finished');
	expect(screen.getByRole('dialog')).toBeInTheDocument();
	fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
	expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('cancelling names the board and players before calling back', () => {
	const onCancelGame = jest.fn();
	jest.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
	render(<ActiveGamesTable canManage games={[game('g1', 4, 'Ann', 'Bob')]} onSubmitResult={jest.fn()} onCancelGame={onCancelGame} />);

	fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
	expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('board #4 (Ann vs Bob)'));
	expect(onCancelGame).not.toHaveBeenCalled();

	fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
	expect(onCancelGame).toHaveBeenCalledWith('g1');
});

test('viewers see the board layout without result controls', () => {
	render(<ActiveGamesTable games={[game('g2', 2, 'Cat', 'Dan')]} />);
	expect(boardRows()).toEqual(['#1', '#2']);
	expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
