import React from 'react';
import DynamicEffects from '../components/DynamicEffects';
import Card from '../components/Card';
import Button from '../components/Button';
import './Home.css';

const Home = () => {
  return (
    <div className="text-center">
      <div className="content-overlay">
        <DynamicEffects effectType="crown">
          <Card style={{
            maxWidth: '600px',
            margin: '50px auto'
          }}>
            <Card.Header>
              <Card.Title as="h1">Welcome to ArenaManager</Card.Title>
              <p className="text-muted">Powered by Skaki NTUA - Le Roi</p>
            </Card.Header>
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
                  <Button to="/dashboard" variant="primary">
                    Get Started
                  </Button>
                </DynamicEffects>
                <DynamicEffects effectType="chess-pieces">
                  <Button to="/tournaments" variant="secondary">
                    View Tournaments
                  </Button>
                </DynamicEffects>
              </div>
            </div>
          </Card>
        </DynamicEffects>
        <div className="mt-5">
          <Card>
            <Card.Header>
              <Card.Title as="h2">How It Works</Card.Title>
            </Card.Header>
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
          </Card>
        </div>

        {/* Social Media Links */}
        <div className="home-social-info">
          <a 
            href="https://www.instagram.com/skakintua/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="home-social-link instagram"
            title="Follow us on Instagram"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
          </a>
          <a 
            href="https://www.facebook.com/skakintua" 
            target="_blank" 
            rel="noopener noreferrer"
            className="home-social-link facebook"
            title="Like us on Facebook"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
          </a>
          <a 
            href="https://www.twitch.tv/skakintua" 
            target="_blank" 
            rel="noopener noreferrer"
            className="home-social-link twitch"
            title="Watch us on Twitch"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
            </svg>
          </a>
          <a 
            href="https://lichess.org/@/skakintua" 
            target="_blank" 
            rel="noopener noreferrer"
            className="home-social-link lichess"
            title="Play with us on Lichess"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.965a1.651 1.651 0 01-1.651 1.651 1.651 1.651 0 01-1.651-1.651 1.651 1.651 0 011.651-1.651 1.651 1.651 0 011.651 1.651zm-9.037 0a1.651 1.651 0 01-1.651 1.651 1.651 1.651 0 01-1.651-1.651 1.651 1.651 0 011.651-1.651 1.651 1.651 0 011.651 1.651zM12 18.947c-2.297 0-4.394-.881-5.965-2.317.673.261 1.398.401 2.158.401 2.726 0 5.159-1.681 6.156-4.221.997 2.54 3.43 4.221 6.156 4.221.76 0 1.485-.14 2.158-.401-1.571 1.436-3.668 2.317-5.965 2.317z"/>
            </svg>
          </a>
          <a 
            href="mailto:skaki@ntua.gr" 
            className="home-social-link email"
            title="Contact us via email"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-.904.732-1.636 1.636-1.636h.273L12 10.92l10.091-7.099h.273c.904 0 1.636.732 1.636 1.636z"/>
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
};

export default Home; 
