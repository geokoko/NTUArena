import React, { useState } from 'react';
import ChessboardComponent from '../components/Chessboard';
import DynamicEffects from '../components/DynamicEffects';

const ChessboardPage = () => {
  const [gameHistory, setGameHistory] = useState([]);
  const [currentMove, setCurrentMove] = useState(0);

  const handleMove = (move) => {
    const newHistory = [...gameHistory, move];
    setGameHistory(newHistory);
    setCurrentMove(newHistory.length);
  };

  const resetGame = () => {
    setGameHistory([]);
    setCurrentMove(0);
  };

  const undoMove = () => {
    if (currentMove > 0) {
      setCurrentMove(currentMove - 1);
    }
  };

  const redoMove = () => {
    if (currentMove < gameHistory.length) {
      setCurrentMove(currentMove + 1);
    }
  };

  return (
    <div className="container mt-4">
      <div className="row">
        <div className="col-md-8">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Interactive Chessboard</h2>
              <p className="text-muted">Practice your moves or analyze positions</p>
            </div>
            <div className="card-body text-center">
              <ChessboardComponent onMove={handleMove} isInteractive={true} />
            </div>
          </div>
        </div>
        
        <div className="col-md-4">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Game Controls</h3>
            </div>
            <div className="card-body">
              <div className="d-grid gap-2">
                <DynamicEffects effectType="chess-pieces">
                  <button 
                    className="btn btn-primary" 
                    onClick={resetGame}
                  >
                    <i className="fas fa-redo"></i> New Game
                  </button>
                </DynamicEffects>
                
                <DynamicEffects effectType="chess-pieces">
                  <button 
                    className="btn btn-secondary" 
                    onClick={undoMove}
                    disabled={currentMove === 0}
                  >
                    <i className="fas fa-undo"></i> Undo
                  </button>
                </DynamicEffects>
                
                <DynamicEffects effectType="chess-pieces">
                  <button 
                    className="btn btn-secondary" 
                    onClick={redoMove}
                    disabled={currentMove === gameHistory.length}
                  >
                    <i className="fas fa-redo"></i> Redo
                  </button>
                </DynamicEffects>
              </div>
              
              <div className="mt-4">
                <h5>Move History</h5>
                <div className="move-history" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {gameHistory.length === 0 ? (
                    <p className="text-muted">No moves yet</p>
                  ) : (
                    <div className="list-group">
                      {gameHistory.map((move, index) => (
                        <div 
                          key={index} 
                          className={`list-group-item ${index < currentMove ? 'active' : ''}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setCurrentMove(index + 1)}
                        >
                          <strong>Move {index + 1}:</strong> {move.piece} from {String.fromCharCode(97 + move.from.col)}{8 - move.from.row} to {String.fromCharCode(97 + move.to.col)}{8 - move.to.row}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="row mt-4">
        <div className="col-12">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Chess Tips</h3>
            </div>
            <div className="card-body">
              <div className="row">
                <div className="col-md-6">
                  <h5>Opening Principles</h5>
                  <ul>
                    <li>Control the center</li>
                    <li>Develop your pieces</li>
                    <li>Castle early</li>
                    <li>Don't move the same piece twice</li>
                  </ul>
                </div>
                <div className="col-md-6">
                  <h5>Middle Game</h5>
                  <ul>
                    <li>Look for tactical opportunities</li>
                    <li>Control open files</li>
                    <li>Coordinate your pieces</li>
                    <li>Create weaknesses in opponent's position</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChessboardPage; 