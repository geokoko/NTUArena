import React, { useCallback, useRef, useState } from 'react';
import './CSVImport.css';

/**
 * Parse CSV text into rows for preview.
 */
const parseCSVPreview = (csvText, maxRows = 5) => {
	if (!csvText) return { headers: [], rows: [] };

	const lines = csvText
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n')
		.split('\n')
		.filter((line) => line.trim());

	if (lines.length === 0) return { headers: [], rows: [] };

	const parseLine = (line) => {
		const fields = [];
		let current = '';
		let inQuotes = false;

		for (let i = 0; i < line.length; i++) {
			const char = line[i];
			if (inQuotes) {
				if (char === '"' && line[i + 1] === '"') {
					current += '"';
					i++;
				} else if (char === '"') {
					inQuotes = false;
				} else {
					current += char;
				}
			} else {
				if (char === '"') {
					inQuotes = true;
				} else if (char === ',') {
					fields.push(current.trim());
					current = '';
				} else {
					current += char;
				}
			}
		}
		fields.push(current.trim());
		return fields;
	};

	const headers = parseLine(lines[0]);
	const rows = lines.slice(1, maxRows + 1).map((line) => parseLine(line));

	return { headers, rows, totalRows: lines.length - 1 };
};

/**
 * CSVImport component for uploading and importing CSV files.
 *
 * @param {Object} props
 * @param {string} props.type - 'users' or 'players'
 * @param {Function} props.onImport - Called with CSV text when user clicks import
 * @param {string} [props.templateContent] - Template CSV content for download
 * @param {string} [props.templateFilename] - Template filename
 */
const CSVImport = ({
	type = 'users',
	onImport,
	templateContent,
	templateFilename = 'template.csv',
}) => {
	const [dragOver, setDragOver] = useState(false);
	const [file, setFile] = useState(null);
	const [csvText, setCsvText] = useState('');
	const [preview, setPreview] = useState({ headers: [], rows: [] });
	const [loading, setLoading] = useState(false);
	const [results, setResults] = useState(null);
	const fileInputRef = useRef(null);

	const handleFile = useCallback((selectedFile) => {
		if (!selectedFile) return;

		if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
			alert('Please select a CSV file');
			return;
		}

		setFile(selectedFile);
		setResults(null);

		const reader = new FileReader();
		reader.onload = (e) => {
			const text = e.target.result;
			setCsvText(text);
			setPreview(parseCSVPreview(text));
		};
		reader.readAsText(selectedFile);
	}, []);

	const handleDrop = useCallback(
		(e) => {
			e.preventDefault();
			setDragOver(false);
			const droppedFile = e.dataTransfer?.files?.[0];
			handleFile(droppedFile);
		},
		[handleFile]
	);

	const handleDragOver = useCallback((e) => {
		e.preventDefault();
		setDragOver(true);
	}, []);

	const handleDragLeave = useCallback((e) => {
		e.preventDefault();
		setDragOver(false);
	}, []);

	const handleClick = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	const handleInputChange = useCallback(
		(e) => {
			handleFile(e.target.files?.[0]);
		},
		[handleFile]
	);

	const handleClear = useCallback(() => {
		setFile(null);
		setCsvText('');
		setPreview({ headers: [], rows: [] });
		setResults(null);
		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	}, []);

	const handleImport = useCallback(async () => {
		if (!csvText || !onImport) return;

		setLoading(true);
		setResults(null);

		try {
			const result = await onImport(csvText);
			setResults(result);
		} catch (err) {
			setResults({
				success: false,
				error: err.message || 'Import failed',
			});
		} finally {
			setLoading(false);
		}
	}, [csvText, onImport]);

	const handleDownloadTemplate = useCallback(() => {
		if (!templateContent) return;

		const blob = new Blob([templateContent], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = templateFilename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}, [templateContent, templateFilename]);

	const formatFileSize = (bytes) => {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	};

	return (
		<div
			className={`csv-import ${dragOver ? 'csv-import--dragover' : ''}`}
			onDrop={handleDrop}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
		>
			<input
				ref={fileInputRef}
				type="file"
				accept=".csv"
				onChange={handleInputChange}
				className="csv-import__file-input"
			/>

			{!file ? (
				<div className="csv-import__dropzone" onClick={handleClick}>
					<div className="csv-import__icon">📄</div>
					<div className="csv-import__title">
						Drop a CSV file here or click to browse
					</div>
					<div className="csv-import__subtitle">
						{type === 'users'
							? 'CSV with username, email, role, globalElo, firstName, lastName columns'
							: 'CSV with name, rating columns (optional: identifier to link account)'}
					</div>
				</div>
			) : (
				<>
					<div className="csv-import__file-info">
						<div className="csv-import__file-name">
							📄 {file.name}
							<span className="csv-import__file-size">
								({formatFileSize(file.size)})
							</span>
						</div>
						<button
							type="button"
							className="btn btn-sm btn-outline-secondary"
							onClick={handleClear}
							disabled={loading}
						>
							Clear
						</button>
					</div>

					{preview.headers.length > 0 && (
						<div className="csv-import__preview">
							<table className="table table-sm table-striped mb-0">
								<thead>
									<tr>
										{preview.headers.map((header, i) => (
											<th key={i}>{header}</th>
										))}
									</tr>
								</thead>
								<tbody>
									{preview.rows.map((row, i) => (
										<tr key={i}>
											{row.map((cell, j) => (
												<td key={j}>{cell}</td>
											))}
										</tr>
									))}
								</tbody>
							</table>
							{preview.totalRows > preview.rows.length && (
								<div className="text-muted text-center py-2">
									... and {preview.totalRows - preview.rows.length} more rows
								</div>
							)}
						</div>
					)}

					<div className="csv-import__actions">
						<button
							type="button"
							className="btn btn-primary"
							onClick={handleImport}
							disabled={loading || !csvText}
						>
							{loading ? (
								<>
									<span
										className="spinner-border spinner-border-sm me-2"
										role="status"
									/>
									Importing...
								</>
							) : (
								`Import ${type === 'users' ? 'Users' : 'Players'}`
							)}
						</button>
					</div>

					{results && (
						<div className="csv-import__results">
							{results.error && !results.success ? (
								<div className="text-danger">{results.error}</div>
							) : (
								<>
									<div className="csv-import__results-summary">
										<div className="csv-import__results-item csv-import__results-item--success">
											<strong>✓ {results.created ?? results.added ?? 0}</strong> imported
										</div>
										<div className="csv-import__results-item csv-import__results-item--skipped">
											<strong>⊘ {results.skipped ?? 0}</strong> skipped
										</div>
										<div className="csv-import__results-item csv-import__results-item--error">
											<strong>✕ {results.failed ?? 0}</strong> failed
										</div>
									</div>
									{results.details?.errors?.length > 0 && (
										<div className="csv-import__results-details">
											<strong>Errors:</strong>
											<ul className="mb-0 mt-1">
												{results.details.errors.slice(0, 5).map((err, i) => (
													<li key={i}>
														Row {err.row}: {err.error || err.identifier}
													</li>
												))}
												{results.details.errors.length > 5 && (
													<li>...and {results.details.errors.length - 5} more</li>
												)}
											</ul>
										</div>
									)}
								</>
							)}
						</div>
					)}
				</>
			)}

			{templateContent && (
				<div className="csv-import__template">
					<span
						className="csv-import__template-link"
						onClick={handleDownloadTemplate}
					>
						Download template CSV
					</span>
				</div>
			)}
		</div>
	);
};

export default CSVImport;
