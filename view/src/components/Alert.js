import React from 'react';
import './Alert.css';

const Alert = ({ type = 'info', children, className = '', ...props }) => {
  return (
    <div className={`alert alert-${type} ${className}`} {...props}>
      {children}
    </div>
  );
};

export default Alert;