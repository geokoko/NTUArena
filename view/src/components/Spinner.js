import React from 'react';
import './Spinner.css';

const Spinner = ({ size = 'md', text, className = '', ...props }) => {
	return (
		<div className={`loading ${className}`} {...props}>
			<div className="loading-spinner"></div>
			{text && <p>{text}</p>}
		</div>
	);
};

export default Spinner;
