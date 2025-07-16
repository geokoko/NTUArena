import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import DynamicBackground from './components/DynamicBackground';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import TournamentList from './pages/TournamentList';
import TournamentDetail from './pages/TournamentDetail';
import AdminDashboard from './pages/AdminDashboard';
import ChessboardPage from './pages/ChessboardPage';
import './App.css';

function App() {
  return (
    <Router>
      <DynamicBackground variant="skaki">
        <div className="App">
          <Navbar />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/tournaments" element={<TournamentList />} />
              <Route path="/tournament/:id" element={<TournamentDetail />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/chessboard" element={<ChessboardPage />} />
            </Routes>
          </main>
        </div>
      </DynamicBackground>
    </Router>
  );
}

export default App; 