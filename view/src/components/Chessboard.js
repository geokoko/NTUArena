import React, { useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import './Chessboard.css';

const ChessboardComponent = ({ gameState = null, onMove = null, isInteractive = true }) => {
	const [game, setGame] = useState(new Chess());
	const [moveHistory, setMoveHistory] = useState([]);

	useEffect(() => {
		if (gameState) {
			// If a game state is provided, load it
			const newGame = new Chess(gameState);
			setGame(newGame);
		}
	}, [gameState]);

	const makeAMove = (move) => {
		const gameCopy = new Chess(game.fen());

		try {
			const result = gameCopy.move(move);
			if (result === null) return false; // Invalid move

			setGame(gameCopy);
			setMoveHistory(gameCopy.history());

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
			return false;
		}
	};

	const onDrop = (sourceSquare, targetSquare) => {
		if (!isInteractive) return false;

		const move = makeAMove({
			from: sourceSquare,
			to: targetSquare,
			promotion: 'q' 
		});

		return move;
	};

	const resetGame = () => {
		const newGame = new Chess();
		setGame(newGame);
		setMoveHistory([]);
	};

	const undoMove = () => {
		const gameCopy = new Chess(game.fen());
		gameCopy.undo();
		setGame(gameCopy);
		setMoveHistory(gameCopy.history());
	};

	const getGameStatus = () => {
		if (game.isCheckmate()) return 'Checkmate';
		if (game.isDraw()) return 'Draw';
		if (game.isCheck()) return 'Check';
		return 'In Progress';
	};

	return (
		<div className="chessboard-container">
			<div className="game-status mb-3">
				<h4>Game Status: {getGameStatus()}</h4>
				<p>Turn: {game.turn() === 'w' ? 'White' : 'Black'}</p>
			</div>

			{/* Chessboard */}
			<Chessboard
				position={game.fen()}
				onPieceDrop={onDrop}
				boardWidth={Math.min(560, window.innerWidth - 40)}
				customBoardStyle={{
					borderRadius: '8px',
					boxShadow: '0 8px 25px rgba(139, 69, 19, 0.3)',
					margin: '0 auto 20px auto'
				}}
				customDarkSquareStyle={{ backgroundColor: '#8B4513' }}
				customLightSquareStyle={{ backgroundColor: '#F5DEB3' }}
				areArrowsAllowed={true} // allow arrows
				arePremovesAllowed={false}
				isDraggablePiece={({ piece }) => isInteractive}
				customDropSquareStyle={{
					boxShadow: 'inset 0 0 1px 6px rgba(255,255,0,0.75)'
				}}
			/>

			<div className="game-controls mt-3">
				<button className="btn btn-primary me-2" onClick={resetGame}>
					<i className="fas fa-redo"></i> New Game
				</button>
				<button className="btn btn-secondary me-2" onClick={undoMove} disabled={moveHistory.length === 0}>
					<i className="fas fa-undo"></i> Undo
				</button>
				<button className="btn btn-info" onClick={() => console.log('FEN:', game.fen())}>
					<i className="fas fa-code"></i> Show FEN
				</button>
			</div>

			<div className="move-history mt-3">
				<h5>Move History</h5>
				<div className="history-container" style={{ maxHeight: '200px', overflowY: 'auto' }}>
					{moveHistory.length === 0 ? (
						<p className="text-muted">No moves yet</p>
					) : (
							<div className="moves-list">
								{moveHistory.map((move, index) => (
									<span key={index} className="move-item">
										{Math.floor(index / 2) + 1}.{index % 2 === 0 ? '' : ' '}{move} 
									</span>
								))}
							</div>
						)}
				</div>
			</div>
		</div>
	);
};

// Component props:
// - gameState: string (FEN notation) - Initial game position 
// - onMove: function - Callback when a move is made
// - isInteractive: boolean - Whether pieces can be moved

export default ChessboardComponent; 
