import React, { createRef } from 'react';
import { act, render } from '@testing-library/react';
import { Chessboard } from 'react-chessboard';
import ChessboardComponent from './Chessboard';

jest.mock('react-chessboard', () => ({ Chessboard: jest.fn(() => null) }));
afterEach(() => jest.clearAllMocks());
const options = () => Chessboard.mock.calls[Chessboard.mock.calls.length - 1][0].options;

test('v5 drop arguments update the position and notify the parent', () => {
	const ref = createRef();
	const onMove = jest.fn();
	render(<ChessboardComponent ref={ref} onMove={onMove} boardWidth={420} />);
	expect(options().boardStyle.width).toBe(420);
	act(() => {
		expect(options().onPieceDrop({ sourceSquare: 'e2', targetSquare: 'e4' })).toBe(true);
	});
	expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ from: 'e2', to: 'e4', piece: 'p', san: 'e4' }));
	expect(ref.current.getTurn()).toBe('Black');
	expect(options().position).toBe(ref.current.getCurrentPosition());
});

test('read-only boards disable dragging and reject moves', () => {
	const onMove = jest.fn();
	render(<ChessboardComponent isInteractive={false} onMove={onMove} />);
	expect(options().allowDragging).toBe(false);
	expect(options().onPieceDrop({ sourceSquare: 'e2', targetSquare: 'e4' })).toBe(false);
	expect(onMove).not.toHaveBeenCalled();
});

test('off-board drops are rejected', () => {
	const onMove = jest.fn();
	render(<ChessboardComponent onMove={onMove} />);
	expect(options().onPieceDrop({ sourceSquare: 'e2', targetSquare: null })).toBe(false);
	expect(onMove).not.toHaveBeenCalled();
});
