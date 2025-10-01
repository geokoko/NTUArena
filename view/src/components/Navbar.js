import React from 'react';
import { Link } from 'react-router-dom';
import './Navbar.css';

const Navbar = () => {
	return (
		<nav className="navbar">
			<Link to="/" className="navbar-brand">
				ArenaManager
			</Link>
			<ul className="navbar-nav">
				<li><Link to="/dashboard">Dashboard</Link></li>
				<li><Link to="/tournaments">Tournaments</Link></li>
				<li><Link to="/admin/games">Ongoing Games</Link></li>
				<li><Link to="/chessboard">Chessboard</Link></li>
				<li><Link to="/admin">Admin</Link></li>
			</ul>
		</nav>
	);
};

export default Navbar; 
