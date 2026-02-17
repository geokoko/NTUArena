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
	const [authEnabled, setAuthEnabled] = useState(true);

	// Check auth status and validate token on mount
	useEffect(() => {
		authAPI.getAuthStatus()
			.then((res) => {
				const enabled = res.data.authEnabled;
				setAuthEnabled(enabled);

				if (!enabled) {
					// Auth disabled: auto-authenticate as mock admin
					setUser({
						id: 'dev-user',
						username: 'dev-admin',
						email: 'dev@localhost',
						role: 'admin',
						isActive: true,
					});
					setToken('auth-disabled');
					setLoading(false);
					return;
				}

				// Auth enabled: validate stored token
				const storedToken = localStorage.getItem('authToken');
				if (storedToken) {
					setToken(storedToken);
					authAPI.getMe()
						.then((meRes) => {
							setUser(meRes.data.user);
							localStorage.setItem('authUser', JSON.stringify(meRes.data.user));
						})
						.catch(() => {
							localStorage.removeItem('authToken');
							localStorage.removeItem('authUser');
							setToken(null);
						})
						.finally(() => setLoading(false));
				} else {
					setLoading(false);
				}
			})
			.catch(() => {
				// Can't reach server — fall back to localStorage
				const storedToken = localStorage.getItem('authToken');
				const storedUser = localStorage.getItem('authUser');
				if (storedToken && storedUser) {
					try {
						setToken(storedToken);
						setUser(JSON.parse(storedUser));
					} catch (e) {
						localStorage.removeItem('authToken');
						localStorage.removeItem('authUser');
					}
				}
				setLoading(false);
			});
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
		authEnabled,
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

