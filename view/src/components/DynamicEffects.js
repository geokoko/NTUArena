import React, { useState } from 'react';
import './DynamicEffects.css';

const DynamicEffects = ({ children, effectType = 'chess-pieces', className = '' }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div 
      className={`dynamic-effects ${effectType} ${isHovered ? 'hovered' : ''} ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
      
      {/* Chess pieces that appear on hover */}
      {effectType === 'chess-pieces' && (
        <>
          <div className="effect-piece pawn">♟</div>
          <div className="effect-piece knight">♞</div>
          <div className="effect-piece bishop">♝</div>
          <div className="effect-piece rook">♜</div>
          <div className="effect-piece queen">♛</div>
          <div className="effect-piece king">♚</div>
        </>
      )}
      
      {/* Crown effect for special elements */}
      {effectType === 'crown' && (
        <div className="effect-crown">♔</div>
      )}
      
      {/* Pawn promotion effect */}
      {effectType === 'promotion' && (
        <>
          <div className="effect-pawn">♟</div>
          <div className="effect-queen">♛</div>
        </>
      )}
    </div>
  );
};

export default DynamicEffects; 