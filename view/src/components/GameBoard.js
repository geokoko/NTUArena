import React from 'react';
import ChessboardComponent from './Chessboard';

const GameBoard = ({ gameId, gameState, player1, player2, result, isLive = false }) => {
  return (
    <div className="game-board-container">
      <div className="card">
        <div className="card-header">
          <div className="d-flex justify-content-between align-items-center">
            <h5 className="card-title mb-0">
              {player1} vs {player2}
            </h5>
            <div className="game-status">
              {isLive && <span className="badge bg-success">Live</span>}
              {result && <span className="badge bg-info">{result}</span>}
            </div>
          </div>
        </div>
        <div className="card-body text-center">
          <div className="game-info mb-3">
            <div className="row">
              <div className="col-md-4">
                <div className="player-info">
                  <strong>{player1}</strong>
                  <div className="player-rating">Rating: 1500</div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="game-time">
                  <div className="time-display">15:30</div>
                  <div className="move-count">Move 12</div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="player-info">
                  <strong>{player2}</strong>
                  <div className="player-rating">Rating: 1480</div>
                </div>
              </div>
            </div>
          </div>
          
          <ChessboardComponent 
            gameState={gameState} 
            isInteractive={false}
          />
          
          <div className="game-actions mt-3">
            <button className="btn btn-sm btn-outline-primary me-2">
              <i className="fas fa-play"></i> Watch Live
            </button>
            <button className="btn btn-sm btn-outline-secondary me-2">
              <i className="fas fa-history"></i> Move History
            </button>
            <button className="btn btn-sm btn-outline-info">
              <i className="fas fa-chart-line"></i> Analysis
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameBoard; 