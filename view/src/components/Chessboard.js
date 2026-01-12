// Custom Chessboard component based on react-chessboard library
import React, { useState, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';

const ChessboardComponent = forwardRef(({ 
	gameState = null, 
	onMove = null, 
	isInteractive = true, 
	onGameUpdate = null,
	boardWidth = 560 
}, ref) => {
		const [game, setGame] = useState(() => new Chess());
		const [moveHistory, setMoveHistory] = useState([]);

		// Load game state when provided
		useEffect(() => {
			if (gameState) {
				try {
					const newGame = new Chess(gameState);
					setGame(newGame);
					setMoveHistory(newGame.history());
				} catch (error) {
					console.error('Invalid game state:', error);
				}
			}
		}, [gameState]);

		// Game status helper
		const getGameStatus = useCallback((gameInstance = game) => {
			if (gameInstance.isCheckmate()) return 'Checkmate';
			if (gameInstance.isDraw()) return 'Draw';
			if (gameInstance.isCheck()) return 'Check';
			return 'In Progress';
		}, [game]);

		// Make a move
		const makeAMove = useCallback((move) => {
			try {
				const gameCopy = new Chess();
				gameCopy.loadPgn(game.pgn());
				const result = gameCopy.move(move);

				if (!result) return false; // Invalid move

				const newHistory = gameCopy.history();

				setGame(gameCopy);
				setMoveHistory(newHistory);

				// Notify parent of game update
				if (onGameUpdate) {
					onGameUpdate({
						game: gameCopy,
						moveHistory: newHistory,
						gameStatus: getGameStatus(gameCopy)
					});
				}

				// Notify parent of move
				if (onMove) {
					onMove({
						from: move.from,
						to: move.to,
						piece: move.piece,
						san: result.san,
						fen: gameCopy.fen()
					});
				}

				return true;
			} catch (error) {
				console.error('Move error:', error);
				return false;
			}
		}, [game, onMove, onGameUpdate, getGameStatus]);

		// Handle piece drop
		const onDrop = useCallback((sourceSquare, targetSquare) => {
			if (!isInteractive) return false;

			return makeAMove({
				from: sourceSquare,
				to: targetSquare,
				promotion: 'q'
			});
		}, [isInteractive, makeAMove]);

		// Reset game
		const resetGame = useCallback(() => {
			const newGame = new Chess();
			setGame(newGame);
			setMoveHistory([]);

			if (onGameUpdate) {
				onGameUpdate({
					game: newGame,
					moveHistory: [],
					gameStatus: 'In Progress'
				});
			}
		}, [onGameUpdate]);

		// Undo move
		const undoMove = useCallback(() => {
			try {
				const gameCopy = new Chess();
				gameCopy.loadPgn(game.pgn());
				const undoResult = gameCopy.undo();

				if (undoResult) {
					const newHistory = gameCopy.history();
					setGame(gameCopy);
					setMoveHistory(newHistory);

					if (onGameUpdate) {
						onGameUpdate({
							game: gameCopy,
							moveHistory: newHistory,
							gameStatus: getGameStatus(gameCopy)
						});
					}
				}
			} catch (error) {
				console.error('Undo error:', error);
			}
		}, [game, onGameUpdate, getGameStatus]);

		// Check if piece is draggable
		const isDraggablePiece = useCallback(({ piece }) => {
			return isInteractive;
		}, [isInteractive]);

		// Expose methods to parent
		useImperativeHandle(ref, () => ({
			resetGame,
			undoMove,
			getGameStatus: () => getGameStatus(),
			getCurrentPosition: () => game.fen(),
			getMoveHistory: () => moveHistory,
			getTurn: () => game.turn() === 'w' ? 'White' : 'Black'
		}), [resetGame, undoMove, getGameStatus, game, moveHistory]);

		return (
			<Chessboard
				position={game.fen()}
				onPieceDrop={onDrop}
				boardWidth={boardWidth}
				isDraggablePiece={isDraggablePiece}
				customBoardStyle={{
					borderRadius: '8px',
					boxShadow: '0 8px 25px rgba(139, 69, 19, 0.3)'
				}}
				customDarkSquareStyle={{ backgroundColor: '#8B4513' }}
				customLightSquareStyle={{ backgroundColor: '#F5DEB3' }}
				customDropSquareStyle={{
					boxShadow: 'inset 0 0 1px 6px rgba(255,255,0,0.75)'
				}}
				areArrowsAllowed={false}
				arePremovesAllowed={false}
			/>
		);
	});

ChessboardComponent.displayName = 'ChessboardComponent';

export default ChessboardComponent;
