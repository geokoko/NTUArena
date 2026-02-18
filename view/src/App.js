import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import DynamicBackground from './components/DynamicBackground';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
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
		<AuthProvider>
			<Router>
				<DynamicBackground variant="skaki">
					<div className="App">
						<Navbar />
						<main className="main-content">
							<Routes>
								{/* Public routes */}
								<Route path="/" element={<Home />} />
								<Route path="/login" element={<Login />} />
								<Route path="/register" element={<Register />} />
								<Route path="/tournaments" element={<TournamentList />} />
								<Route path="/tournament/:id" element={<TournamentDetail />} />
								<Route path="/chessboard" element={<ChessboardPage />} />
								
								{/* Protected routes - any authenticated user */}
								<Route path="/dashboard" element={
									<ProtectedRoute>
										<Dashboard />
									</ProtectedRoute>
								} />
								
								{/* Admin-only routes */}
								<Route path="/admin" element={
									<ProtectedRoute requiredRole="admin">
										<AdminDashboard />
									</ProtectedRoute>
								} />
								<Route path="/admin/users/new" element={
									<ProtectedRoute requiredRole="admin">
										<AdminCreateUser />
									</ProtectedRoute>
								} />
								<Route path="/admin/tournaments/new" element={
									<ProtectedRoute requiredRole="admin">
										<AdminCreateTournament />
									</ProtectedRoute>
								} />
								<Route path="/admin/tournaments/:id/manage" element={
									<ProtectedRoute requiredRole="admin">
										<TournamentManage />
									</ProtectedRoute>
								} />
								<Route path="/admin/games" element={
									<ProtectedRoute requiredRole="admin">
										<AdminOngoingGames />
									</ProtectedRoute>
								} />
								<Route path="/users" element={
									<ProtectedRoute requiredRole="admin">
										<UserDatabasePage />
									</ProtectedRoute>
								} />
								
								<Route path="*" element={<h2>404: Page Not Found</h2>} />
							</Routes>
						</main>
					</div>
				</DynamicBackground>
			</Router>
		</AuthProvider>
	);
}

export default App; 
