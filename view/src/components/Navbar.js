import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Navbar.css';

const Navbar = () => {
	const { user, isAuthenticated, isAdmin, logout } = useAuth();
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const dropdownRef = useRef(null);
	const navigate = useNavigate();

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
				setDropdownOpen(false);
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, []);

	const handleLogout = () => {
		logout();
		setDropdownOpen(false);
		navigate('/');
	};

	return (
		<nav className="navbar">
			<Link to="/" className="navbar-brand">
				NTUArena
			</Link>
			<ul className="navbar-nav">
				<li><Link to="/tournaments">Tournaments</Link></li>
				<li><Link to="/chessboard">Chessboard</Link></li>
				
				{isAdmin && (
					<>
						<li><Link to="/admin">Dashboard</Link></li>
						<li><Link to="/admin/games">Ongoing Games</Link></li>
						<li><Link to="/users">User Database</Link></li>
					</>
				)}
			</ul>
			
			<div className="navbar-auth">
				{isAuthenticated ? (
					<div className="user-menu" ref={dropdownRef}>
						<button 
							className="user-menu-button"
							onClick={() => setDropdownOpen(!dropdownOpen)}
						>
							<span className="user-avatar">
								{user?.username?.charAt(0).toUpperCase() || 'U'}
							</span>
							<span className="user-name">{user?.username}</span>
							{isAdmin && <span className="admin-badge">Admin</span>}
							<span className="dropdown-arrow">{dropdownOpen ? '▲' : '▼'}</span>
						</button>
						
						{dropdownOpen && (
							<div className="user-dropdown">
								<div className="dropdown-header">
									<strong>{user?.profile?.firstName || user?.username}</strong>
									<span>{user?.email}</span>
								</div>
								<div className="dropdown-divider"></div>
								<Link to="/dashboard" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
									My Dashboard
								</Link>
								<button className="dropdown-item logout" onClick={handleLogout}>
									Sign Out
								</button>
							</div>
						)}
					</div>
				) : (
					<div className="auth-links">
						<Link to="/login" className="auth-link login">Sign In</Link>
						<Link to="/register" className="auth-link register">Register</Link>
					</div>
				)}
			</div>
		</nav>
	);
};

export default Navbar; 
