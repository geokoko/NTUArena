import React from 'react';
import './Form.css';

const Form = ({ children, onSubmit, className = '', ...props }) => {
	return (
		<form onSubmit={onSubmit} className={className} {...props}>
			{children}
		</form>
	);
};

const FormContainer = ({ children, title, className = '', ...props }) => {
	return (
		<div className={`form-container ${className}`} {...props}>
			{title && <h2>{title}</h2>}
			{children}
		</div>
	);
};

const FormGroup = ({ children, className = '', ...props }) => {
	return (
		<div className={`form-group ${className}`} {...props}>
			{children}
		</div>
	);
};

const FormLabel = ({ children, htmlFor, className = '', ...props }) => {
	return (
		<label htmlFor={htmlFor} className={className} {...props}>
			{children}
		</label>
	);
};

const FormInput = ({ 
	type = 'text', 
	id, 
	name, 
	value, 
	onChange, 
	placeholder, 
	required = false,
	disabled = false,
	className = '', 
	...props 
}) => {
	return (
		<input
			type={type}
			id={id}
			name={name}
			value={value}
			onChange={onChange}
			placeholder={placeholder}
			required={required}
			disabled={disabled}
			className={className}
			{...props}
		/>
	);
};

const FormSelect = ({ 
	id, 
	name, 
	value, 
	onChange, 
	children,
	required = false,
	disabled = false,
	className = '', 
	...props 
}) => {
	return (
		<select
			id={id}
			name={name}
			value={value}
			onChange={onChange}
			required={required}
			disabled={disabled}
			className={className}
			{...props}
		>
			{children}
		</select>
	);
};

const FormTextarea = ({ 
	id, 
	name, 
	value, 
	onChange, 
	placeholder,
	rows = 4,
	required = false,
	disabled = false,
	className = '', 
	...props 
}) => {
	return (
		<textarea
			id={id}
			name={name}
			value={value}
			onChange={onChange}
			placeholder={placeholder}
			rows={rows}
			required={required}
			disabled={disabled}
			className={className}
			{...props}
		/>
	);
};

Form.Container = FormContainer;
Form.Group = FormGroup;
Form.Label = FormLabel;
Form.Input = FormInput;
Form.Select = FormSelect;
Form.Textarea = FormTextarea;

export default Form;
