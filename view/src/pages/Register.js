import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import './Register.css';

const Register = () => {
	const [formData, setFormData] = useState({
		username: '',
		email: '',
		password: '',
		confirmPassword: '',
		firstName: '',
		lastName: '',
	});
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const [success, setSuccess] = useState(false);
	
	const navigate = useNavigate();

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

		// Validate passwords match
		if (formData.password !== formData.confirmPassword) {
			setError('Passwords do not match');
			return;
		}

		// Validate password length
		if (formData.password.length < 8) {
			setError('Password must be at least 8 characters long');
			return;
		}

		setLoading(true);

		try {
			await authAPI.register({
				username: formData.username,
				email: formData.email,
				password: formData.password,
				profile: {
					firstName: formData.firstName,
					lastName: formData.lastName,
				},
			});
			
			setSuccess(true);
			setTimeout(() => {
				navigate('/login', { 
					state: { message: 'Registration successful! Please sign in.', type: 'success' } 
				});
			}, 1500);
		} catch (err) {
			setError(err.message || 'Registration failed. Please try again.');
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="register-page">
			<div className="register-container">
				<div className="register-header">
					<h1>Create Account</h1>
					<p>Join NTUArena and start competing</p>
				</div>

				{success && (
					<div className="register-alert alert-success">
						<span className="alert-icon">✓</span>
						Account created successfully! Redirecting to login...
					</div>
				)}

				{error && (
					<div className="register-alert alert-error">
						<span className="alert-icon">⚠️</span>
						{error}
					</div>
				)}

				<form onSubmit={handleSubmit} className="register-form">
					<div className="form-row">
						<div className="form-group">
							<label htmlFor="firstName">First Name</label>
							<input
								type="text"
								id="firstName"
								name="firstName"
								value={formData.firstName}
								onChange={handleChange}
								placeholder="Enter first name"
								disabled={loading || success}
							/>
						</div>
						<div className="form-group">
							<label htmlFor="lastName">Last Name</label>
							<input
								type="text"
								id="lastName"
								name="lastName"
								value={formData.lastName}
								onChange={handleChange}
								placeholder="Enter last name"
								disabled={loading || success}
							/>
						</div>
					</div>

					<div className="form-group">
						<label htmlFor="username">Username *</label>
						<input
							type="text"
							id="username"
							name="username"
							value={formData.username}
							onChange={handleChange}
							placeholder="Choose a username"
							required
							disabled={loading || success}
						/>
					</div>

					<div className="form-group">
						<label htmlFor="email">Email *</label>
						<input
							type="email"
							id="email"
							name="email"
							value={formData.email}
							onChange={handleChange}
							placeholder="your@email.com"
							required
							disabled={loading || success}
						/>
					</div>

					<div className="form-group">
						<label htmlFor="password">Password *</label>
						<input
							type="password"
							id="password"
							name="password"
							value={formData.password}
							onChange={handleChange}
							placeholder="At least 8 characters"
							required
							disabled={loading || success}
						/>
					</div>

					<div className="form-group">
						<label htmlFor="confirmPassword">Confirm Password *</label>
						<input
							type="password"
							id="confirmPassword"
							name="confirmPassword"
							value={formData.confirmPassword}
							onChange={handleChange}
							placeholder="Re-enter your password"
							required
							disabled={loading || success}
						/>
					</div>

					<button 
						type="submit" 
						className="register-button"
						disabled={loading || success}
					>
						{loading ? 'Creating Account...' : 'Create Account'}
					</button>
				</form>

				<div className="register-footer">
					<p>
						Already have an account?{' '}
						<Link to="/login">Sign in</Link>
					</p>
				</div>
			</div>
		</div>
	);
};

export default Register;
