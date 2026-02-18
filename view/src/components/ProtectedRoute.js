import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Spinner from './Spinner';

/**
 * Protected Route component that handles authentication and authorization.
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - The component to render if authorized
 * @param {string} [props.requiredRole] - Optional role required to access the route
 */
const ProtectedRoute = ({ children, requiredRole }) => {
	const { isAuthenticated, user, loading } = useAuth();
	const location = useLocation();

	// Show loading spinner while checking auth state
	if (loading) {
		return (
			<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
				<Spinner />
			</div>
		);
	}

	// Not authenticated - redirect to login with message
	if (!isAuthenticated) {
		return (
			<Navigate 
				to="/login" 
				state={{ 
					from: location,
					message: 'You must be logged in to access this page.',
					type: 'unauthenticated'
				}} 
				replace 
			/>
		);
	}

	// Check role if required
	if (requiredRole && user?.role !== requiredRole) {
		return (
			<Navigate 
				to="/login" 
				state={{ 
					from: location,
					message: 'You do not have permission to access this page.',
					type: 'unauthorized'
				}} 
				replace 
			/>
		);
	}

	return children;
};

export default ProtectedRoute;
