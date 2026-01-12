import React, { useState, useRef, useCallback } from 'react';
import ChessboardComponent from '../components/Chessboard';
import './ChessboardPage.css';

const ChessboardPage = () => {
	const chessboardRef = useRef();
	const [gameState, setGameState] = useState({
		moveHistory: [],
		gameStatus: 'In Progress',
		turn: 'White'
	});

	const handleGameUpdate = useCallback((newGameState) => {
		setGameState({
			moveHistory: newGameState.moveHistory,
			gameStatus: newGameState.gameStatus,
			turn: newGameState.game.turn() === 'w' ? 'White' : 'Black'
		});
	}, []);

	const handleResetGame = useCallback(() => {
		chessboardRef.current?.resetGame();
	}, []);

	const handleUndoMove = useCallback(() => {
		chessboardRef.current?.undoMove();
	}, []);

	const handleShowFEN = useCallback(() => {
		const fen = chessboardRef.current?.getCurrentPosition();
		if (fen) {
			console.log('FEN:', fen);
			alert(`Current FEN: ${fen}`);
		}
	}, []);

	return (
		<>
			{/* Header Section */}
			<div className="container mt-4">
				<div className="row justify-content-center">
					<div className="col-lg-8 col-md-10">
						<div className="card">
							<div className="card-header text-center">
								<h2 className="card-title mb-1">Interactive Chessboard</h2>
								<p className="text-muted mb-0">Practice your moves or analyze positions</p>
							</div>
							<div className="card-body">
								{/* Game Status */}
								<div className="game-status mb-4">
									<h4>Game Status: {gameState.gameStatus}</h4>
									<p>Turn: {gameState.turn}</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Chessboard Section */}
			<div className="d-flex justify-content-center my-4">
				<ChessboardComponent
					ref={chessboardRef}
					onGameUpdate={handleGameUpdate}
					isInteractive={true}
					boardWidth={Math.min(560, window.innerWidth - 80)}
				/>
			</div>

			{/* Controls and History Section */}
			<div className="container">
				<div className="row justify-content-center">
					<div className="col-lg-8 col-md-10">
						<div className="card">
							<div className="card-body">
								{/* Game Controls */}
								<div className="game-controls mb-4">
									<button 
										className="btn btn-primary me-2" 
										onClick={handleResetGame}
										type="button"
									>
										<i className="fas fa-redo"></i> New Game
									</button>
									<button 
										className="btn btn-secondary me-2" 
										onClick={handleUndoMove} 
										disabled={gameState.moveHistory.length === 0}
										type="button"
									>
										<i className="fas fa-undo"></i> Undo
									</button>
									<button 
										className="btn btn-info" 
										onClick={handleShowFEN}
										type="button"
									>
										<i className="fas fa-code"></i> Show FEN
									</button>
								</div>

								{/* Move History */}
								<div className="move-history">
									<h5>Move History</h5>
									<div className="history-container">
										{gameState.moveHistory.length === 0 ? (
											<p className="text-muted">No moves yet</p>
										) : (
												<div className="moves-list">
													{gameState.moveHistory.map((move, index) => (
														<span key={`${move}-${index}`} className="move-item">
															{Math.floor(index / 2) + 1}{index % 2 === 0 ? '.' : '...'} {move}
														</span>
													))}
												</div>
											)}
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</>
	);
};

export default ChessboardPage;
