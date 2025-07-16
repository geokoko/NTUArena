import React, { useState, useEffect } from 'react';
import SkakiLogo from './SkakiLogo';
import './DynamicBackground.css';

const DynamicBackground = ({ children, variant = 'default' }) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getTimeBasedVariant = () => {
    const hour = currentTime.getHours();
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 22) return 'evening';
    return 'night';
  };

  const backgroundClass = `dynamic-background ${variant} ${getTimeBasedVariant()}`;

  return (
    <div className={backgroundClass}>
      {/* Animated corner brackets */}
      <div className="corner-bracket top-left"></div>
      <div className="corner-bracket top-right"></div>
      <div className="corner-bracket bottom-left"></div>
      <div className="corner-bracket bottom-right"></div>
      
      {/* Permanent falling chess pieces */}
      <div className="falling-piece pawn-1">♟</div>
      <div className="falling-piece knight-1">♞</div>
      <div className="falling-piece bishop-1">♝</div>
      <div className="falling-piece rook-1">♜</div>
      <div className="falling-piece queen-1">♛</div>
      <div className="falling-piece king-1">♚</div>
      <div className="falling-piece pawn-2">♟</div>
      <div className="falling-piece knight-2">♞</div>
      <div className="falling-piece bishop-2">♝</div>
      <div className="falling-piece rook-2">♜</div>
      
      {/* Skaki NTUA Background Logo */}
      <div className="skaki-background-logo">
        <SkakiLogo size="large" showSocial={false} showWelcome={false} />
      </div>
      
      {/* Skaki NTUA Branding Elements */}
      <div className="skaki-branding">
        <div className="branding-top-left">
          <div className="branding-text">Σκακιστική Ομάδα ΕΜΠ Le Roi</div>
        </div>
        <div className="branding-top-center">
          <div className="ntua-text">NTUA</div>
        </div>
      </div>
      
      {/* Content */}
      <div className="background-content">
        {children}
      </div>
    </div>
  );
};

export default DynamicBackground; 