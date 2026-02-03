import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

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

	// Load token and user from localStorage on mount
	useEffect(() => {
		const storedToken = localStorage.getItem('authToken');
		const storedUser = localStorage.getItem('authUser');
		
		if (storedToken && storedUser) {
			try {
				setToken(storedToken);
				setUser(JSON.parse(storedUser));
			} catch (e) {
				// Clear invalid data
				localStorage.removeItem('authToken');
				localStorage.removeItem('authUser');
			}
		}
		setLoading(false);
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
