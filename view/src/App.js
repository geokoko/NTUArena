import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import DynamicBackground from './components/DynamicBackground';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import TournamentList from './pages/TournamentList';
import TournamentDetail from './pages/TournamentDetail';
import TournamentManage from './pages/TournamentManage';
import AdminDashboard from './pages/AdminDashboard';
import AdminCreateUser from './pages/AdminCreateUser';
import AdminCreateTournament from './pages/AdminCreateTournament';
import ChessboardPage from './pages/ChessboardPage';
import AdminOngoingGames from './pages/AdminOngoingGames';
import UserDatabasePage from './pages/UserDatabasePage';
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
							<Route path="/admin/tournaments/:id/manage" element={<TournamentManage />} />
							<Route path="/admin" element={<AdminDashboard />} />
							<Route path="/admin/users/new" element={<AdminCreateUser />} />
							<Route path="/admin/tournaments/new" element={<AdminCreateTournament />} />
							<Route path="/admin/games" element={<AdminOngoingGames />} />
							<Route path="/chessboard" element={<ChessboardPage />} />
							<Route path="/users" element={<UserDatabasePage />} />
							<Route path="*" element={<h2>404: Page Not Found</h2>} />
						</Routes>
					</main>
				</div>
			</DynamicBackground>
		</Router>
	);
}

export default App; 
