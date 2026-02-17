import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error('useAuth must be used within an AuthProvider');
	}
	return context;
};

export const AuthProvider = ({ children }) => {
	const [user, setUser] = useState(null);
	const [token, setToken] = useState(null);
	const [loading, setLoading] = useState(true);

	// Load token from localStorage and validate against server on mount
	useEffect(() => {
		const storedToken = localStorage.getItem('authToken');
		
		if (storedToken) {
			// Set token so the API interceptor includes it
			setToken(storedToken);
			
			// Validate token against the server
			authAPI.getMe()
				.then((res) => {
					setUser(res.data.user);
					localStorage.setItem('authUser', JSON.stringify(res.data.user));
				})
				.catch(() => {
					// Token expired or invalid — clear everything
					localStorage.removeItem('authToken');
					localStorage.removeItem('authUser');
					setToken(null);
				})
				.finally(() => setLoading(false));
		} else {
			setLoading(false);
		}
	}, []);

	const login = useCallback((userData, authToken) => {
		setUser(userData);
		setToken(authToken);
		localStorage.setItem('authToken', authToken);
		localStorage.setItem('authUser', JSON.stringify(userData));
	}, []);

	const logout = useCallback(() => {
		setUser(null);
		setToken(null);
		localStorage.removeItem('authToken');
		localStorage.removeItem('authUser');
	}, []);

	const isAuthenticated = !!token && !!user;
	const isAdmin = user?.role === 'admin';
	const isPlayer = user?.role === 'player';

	const value = {
		user,
		token,
		loading,
		isAuthenticated,
		isAdmin,
		isPlayer,
		login,
		logout,
	};

	return (
		<AuthContext.Provider value={value}>
			{children}
		</AuthContext.Provider>
	);
};

export default AuthContext;
