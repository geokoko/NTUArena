import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import GameResultDialog, { INPUT_PROTECTION_MS } from './GameResultDialog';

const finished = {
	id: 'g1',
	boardNumber: 3,
	resultColor: 'white',
	isFinished: true,
	playerWhite: { id: 'w', name: 'Ann' },
	playerBlack: { id: 'b', name: 'Bob' },
};

afterEach(() => jest.restoreAllMocks());

test('a correction starts from the recorded result and needs a different one', async () => {
	const onConfirm = jest.fn().mockResolvedValue();
	const onClose = jest.fn();
	render(<GameResultDialog game={finished} recordedResult="white" onConfirm={onConfirm} onClose={onClose} />);

	const dialog = screen.getByRole('dialog', { name: 'Correct result' });
	expect(dialog).toHaveTextContent('Board 3');
	expect(dialog).toHaveTextContent('Recorded as 1-0');
	expect(screen.getByRole('button', { name: /Ann wins/ })).toHaveTextContent('Recorded');
	expect(screen.getByRole('button', { name: 'Choose the correct result' })).toBeDisabled();

	fireEvent.click(screen.getByRole('button', { name: /Bob wins/ }));
	jest.spyOn(Date, 'now').mockReturnValue(Date.now() + INPUT_PROTECTION_MS);
	fireEvent.click(screen.getByRole('button', { name: 'Change to 0-1' }));

	expect(onConfirm).toHaveBeenCalledWith('black');
	await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
});

test('Back and Escape close without saving, but not right after opening', () => {
	const onConfirm = jest.fn();
	const onClose = jest.fn();
	render(<GameResultDialog game={finished} initialResult="draw" onConfirm={onConfirm} onClose={onClose} />);

	expect(screen.getByRole('button', { name: 'Confirm ½-½' })).toHaveFocus();
	fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
	fireEvent.click(screen.getByRole('button', { name: 'Back' }));
	expect(onClose).not.toHaveBeenCalled();

	jest.spyOn(Date, 'now').mockReturnValue(Date.now() + INPUT_PROTECTION_MS);
	fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
	fireEvent.click(screen.getByRole('button', { name: 'Back' }));

	expect(onClose).toHaveBeenCalledTimes(2);
	expect(onConfirm).not.toHaveBeenCalled();
});

test('a held Enter does not confirm, a fresh press does', () => {
	render(<GameResultDialog game={finished} initialResult="white" onConfirm={jest.fn()} onClose={jest.fn()} />);
	const confirm = screen.getByRole('button', { name: 'Confirm 1-0' });

	// fireEvent returns false when the default action (activating the button) was prevented.
	expect(fireEvent.keyDown(confirm, { key: 'Enter', repeat: true })).toBe(false);
	expect(fireEvent.keyDown(confirm, { key: 'Enter' })).toBe(true);
});

test('Tab stays inside the dialog', () => {
	render(<GameResultDialog game={finished} initialResult="white" onConfirm={jest.fn()} onClose={jest.fn()} />);
	const confirm = screen.getByRole('button', { name: 'Confirm 1-0' });

	fireEvent.keyDown(confirm, { key: 'Tab' });
	expect(screen.getByRole('button', { name: /Ann wins/ })).toHaveFocus();
	fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });
	expect(confirm).toHaveFocus();
});
