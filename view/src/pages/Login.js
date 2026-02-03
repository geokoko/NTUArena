import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';
import './Login.css';

const Login = () => {
	const [formData, setFormData] = useState({
		username: '',
		password: '',
	});
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	
	const { login } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	
	// Get redirect message from location state
	const redirectMessage = location.state?.message;
	const redirectType = location.state?.type;
	const from = location.state?.from?.pathname || '/';

	const handleChange = (e) => {
		setFormData({
			...formData,
			[e.target.name]: e.target.value,
		});
		setError('');
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		setError('');
		setLoading(true);

		try {
			const response = await authAPI.login(formData.username, formData.password);
			login(response.data.user, response.data.token);
			navigate(from, { replace: true });
		} catch (err) {
			setError(err.message || 'Login failed. Please check your credentials.');
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="login-page">
			<div className="login-container">
				<div className="login-header">
					<h1>Welcome Back</h1>
					<p>Sign in to your NTUArena account</p>
				</div>

				{redirectMessage && (
					<div className={`login-alert ${redirectType === 'unauthorized' ? 'alert-error' : 'alert-warning'}`}>
						<span className="alert-icon">
							{redirectType === 'unauthorized' ? '🚫' : '🔒'}
						</span>
						{redirectMessage}
					</div>
				)}

				{error && (
					<div className="login-alert alert-error">
						<span className="alert-icon">⚠️</span>
						{error}
					</div>
				)}

				<form onSubmit={handleSubmit} className="login-form">
					<div className="form-group">
						<label htmlFor="username">Username or Email</label>
						<input
							type="text"
							id="username"
							name="username"
							value={formData.username}
							onChange={handleChange}
							placeholder="Enter your username or email"
							required
							disabled={loading}
						/>
					</div>

					<div className="form-group">
						<label htmlFor="password">Password</label>
						<input
							type="password"
							id="password"
							name="password"
							value={formData.password}
							onChange={handleChange}
							placeholder="Enter your password"
							required
							disabled={loading}
						/>
					</div>

					<button 
						type="submit" 
						className="login-button"
						disabled={loading}
					>
						{loading ? 'Signing in...' : 'Sign In'}
					</button>
				</form>

				<div className="login-footer">
					<p>
						Don't have an account?{' '}
						<Link to="/register">Create one</Link>
					</p>
				</div>
			</div>
		</div>
	);
};

export default Login;
