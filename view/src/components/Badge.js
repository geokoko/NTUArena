import React from 'react';
import './Badge.css';

const Badge = ({ type = 'primary', children, className = '', ...props }) => {
	return (
		<span className={`badge badge-${type} ${className}`} {...props}>
			{children}
		</span>
	);
};

export default Badge;
