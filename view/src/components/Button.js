import React from 'react';
import { Link } from 'react-router-dom';
import './Button.css';

const Button = ({ 
	variant = 'primary', 
	size = 'md',
	block = false,
	disabled = false,
	to,
	href,
	onClick,
	children, 
	className = '', 
	...props 
}) => {
	const classes = [
		'btn',
		`btn-${variant}`,
		block && 'btn-block',
		className
	].filter(Boolean).join(' ');

	// If it's a link to another route
	if (to) {
		return (
			<Link to={to} className={classes} {...props}>
				{children}
			</Link>
		);
	}

	// If it's an external link
	if (href) {
		return (
			<a href={href} className={classes} {...props}>
				{children}
			</a>
		);
	}

	// Regular button
	return (
		<button 
			className={classes} 
			onClick={onClick}
			disabled={disabled}
			{...props}
		>
			{children}
		</button>
	);
};

export default Button;
