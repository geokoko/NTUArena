import React from 'react';
import './SkakiLogo.css';
import leRoiLogo from './pictures/Le-Roi-logo.png';

const SkakiLogo = ({ size = 'medium', showSocial = true, showWelcome = true }) => {
  return (
    <div className={`skaki-logo-container ${size}`}>
      {/* Main Logo */}
      <div className="skaki-logo">
        <div className="logo-circle">
          <img 
            src={leRoiLogo} 
            alt="Skaki NTUA - Le Roi Logo" 
            className="logo-image"
          />
        </div>
      </div>

      {/* Social Media Info */}
      {showSocial && (
        <div className="social-info">
          <a href="https://www.instagram.com/skakintua/" target="_blank" rel="noopener noreferrer" className="social-item">
            <i className="fab fa-instagram"></i>
            <span>@skakintua</span>
          </a>
          <a href="https://www.facebook.com/skakintua/?locale=el_GR" target="_blank" rel="noopener noreferrer" className="social-item">
            <i className="fab fa-facebook"></i>
            <span>Σκακιστική Ομάδα ΕΜΠ Le Roi</span>
          </a>
          <a href="https://lichess.org/team/7DNFQuFz" target="_blank" rel="noopener noreferrer" className="social-item">
            <i className="fas fa-chess"></i>
            <span>Lichess Team</span>
          </a>
          <a href="https://www.twitch.tv/skaki_ntua/about" target="_blank" rel="noopener noreferrer" className="social-item">
            <i className="fab fa-twitch"></i>
            <span>Twitch</span>
          </a>
        </div>
      )}

      {/* Welcome Message */}
      {showWelcome && (
        <div className="welcome-message">
          <div className="title">SKAKI NTUA</div>
          <div className="subtitle">WELCOME TO OUR ARENA MANAGING SOFTWARE</div>
        </div>
      )}
    </div>
  );
};

export default SkakiLogo; 
