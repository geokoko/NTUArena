import React from 'react';
import './Table.css';

const Table = ({ children, className = '', striped = false, hover = true, ...props }) => {
  return (
    <table className={`table ${className}`} {...props}>
      {children}
    </table>
  );
};

const TableHead = ({ children, className = '', ...props }) => {
  return (
    <thead className={className} {...props}>
      {children}
    </thead>
  );
};

const TableBody = ({ children, className = '', ...props }) => {
  return (
    <tbody className={className} {...props}>
      {children}
    </tbody>
  );
};

const TableRow = ({ children, className = '', ...props }) => {
  return (
    <tr className={className} {...props}>
      {children}
    </tr>
  );
};

const TableHeader = ({ children, className = '', ...props }) => {
  return (
    <th className={className} {...props}>
      {children}
    </th>
  );
};

const TableCell = ({ children, className = '', ...props }) => {
  return (
    <td className={className} {...props}>
      {children}
    </td>
  );
};

Table.Head = TableHead;
Table.Body = TableBody;
Table.Row = TableRow;
Table.Header = TableHeader;
Table.Cell = TableCell;

export default Table;