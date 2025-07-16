import React from 'react';
import { Link } from 'react-router-dom';
import SkakiLogo from '../components/SkakiLogo';
import DynamicEffects from '../components/DynamicEffects';

const Home = () => {
  return (
    <div className="text-center">
      {/* Skaki NTUA Logo */}
      <SkakiLogo size="large" showSocial={true} showWelcome={true} />
      <div className="content-overlay">
        <DynamicEffects effectType="crown">
          <div className="card" style={{
            maxWidth: '600px',
            margin: '50px auto'
          }}>
            <div className="card-header">
              <h1 className="card-title">Welcome to ArenaManager</h1>
              <p className="text-muted">Powered by Skaki NTUA - Le Roi</p>
            </div>
            <div>
              <p className="mb-4">
                ArenaManager is a comprehensive chess tournament management system designed
                for organizing and managing Over-The-Board (OTB) chess tournaments of Arena type.
              </p>
              <div className="mb-4">
                <h3>Features:</h3>
                <ul className="text-left" style={{ maxWidth: '400px', margin: '0 auto' }}>
                  <li>Real-time, Arena-style tournament management</li>
                  <li>Automated player pairing based on multiple criteria, such as Elo, performance, and more</li>
                  <li>Live standings and statistics</li>
                  <li>Player profiles and game history with Elo tracking</li>
                </ul>
              </div>
              <div className="d-flex justify-content-center gap-3">
                <DynamicEffects effectType="chess-pieces">
                  <Link to="/dashboard" className="btn btn-primary">
                    Get Started
                  </Link>
                </DynamicEffects>
                <DynamicEffects effectType="chess-pieces">
                  <Link to="/tournaments" className="btn btn-secondary">
                    View Tournaments
                  </Link>
                </DynamicEffects>
              </div>
            </div>
          </div>
        </DynamicEffects>
        <div className="mt-5">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">How It Works</h2>
            </div>
            <div className="d-flex justify-content-around flex-wrap gap-3">
              <div style={{ flex: '1', minWidth: '200px' }}>
                <h4>1. Browse Tournaments</h4>
                <p className="text-muted">View available tournaments and their details</p>
              </div>
              <div style={{ flex: '1', minWidth: '200px' }}>
                <h4>2. Join Tournament</h4>
                <p className="text-muted">Register for tournaments you want to participate in</p>
              </div>
              <div style={{ flex: '1', minWidth: '200px' }}>
                <h4>3. Play & Compete</h4>
                <p className="text-muted">Get paired with opponents and compete in real-time</p>
              </div>
              <div style={{ flex: '1', minWidth: '200px' }}>
                <h4>4. Track Progress</h4>
                <p className="text-muted">Monitor your performance and view live standings</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home; 