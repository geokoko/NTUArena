import React from 'react';
import './Card.css';

const Card = ({ children, className = '', hover = true, ...props }) => {
  return (
    <div className={`card ${className}`} {...props}>
      {children}
    </div>
  );
};

const CardHeader = ({ children, className = '', ...props }) => {
  return (
    <div className={`card-header ${className}`} {...props}>
      {children}
    </div>
  );
};

const CardTitle = ({ children, className = '', as: Component = 'h3', ...props }) => {
  return (
    <Component className={`card-title ${className}`} {...props}>
      {children}
    </Component>
  );
};

const CardBody = ({ children, className = '', ...props }) => {
  return (
    <div className={`card-body ${className}`} {...props}>
      {children}
    </div>
  );
};

Card.Header = CardHeader;
Card.Title = CardTitle;
Card.Body = CardBody;

export default Card;