/**
 * Simple CSV parser utility for importing users and players.
 */

/**
 * Parse a single CSV line handling quoted fields.
 * @param {string} line - CSV line
 * @returns {string[]} - Array of field values
 */
function parseLine(line) {
	const fields = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		const nextChar = line[i + 1];

		if (inQuotes) {
			if (char === '"' && nextChar === '"') {
				current += '"';
				i++; // Skip next quote
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
}

/**
 * Parse CSV text into array of objects.
 * @param {string} csvText - Raw CSV content
 * @param {Object} options - Parser options
 * @param {string[]} [options.requiredColumns] - List of required column names
 * @param {string[]} [options.allowedColumns] - List of allowed column names (validation)
 * @returns {{ data: Object[], errors: string[], headers: string[] }}
 */
function parseCSV(csvText, options = {}) {
	const { requiredColumns = [], allowedColumns = null } = options;
	const errors = [];
	const data = [];

	if (!csvText || typeof csvText !== 'string') {
		errors.push('CSV content is empty or invalid');
		return { data, errors, headers: [] };
	}

	// Normalize line endings and split
	const lines = csvText
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n')
		.split('\n')
		.filter((line) => line.trim().length > 0);

	if (lines.length === 0) {
		errors.push('CSV file is empty');
		return { data, errors, headers: [] };
	}

	// Parse header row
	const headers = parseLine(lines[0]).map((h) => h.toLowerCase().trim());

	if (headers.length === 0) {
		errors.push('No headers found in CSV');
		return { data, errors, headers: [] };
	}

	// Check required columns
	for (const required of requiredColumns) {
		if (!headers.includes(required.toLowerCase())) {
			errors.push(`Missing required column: ${required}`);
		}
	}

	if (errors.length > 0) {
		return { data, errors, headers };
	}

	// Parse data rows
	for (let i = 1; i < lines.length; i++) {
		const lineNum = i + 1;
		const fields = parseLine(lines[i]);

		if (fields.length !== headers.length) {
			errors.push(`Row ${lineNum}: Expected ${headers.length} columns, got ${fields.length}`);
			continue;
		}

		const row = {};
		for (let j = 0; j < headers.length; j++) {
			const header = headers[j];
			// Skip columns not in allowedColumns if specified
			if (allowedColumns && !allowedColumns.map((c) => c.toLowerCase()).includes(header)) {
				continue;
			}
			row[header] = fields[j];
		}

		// Check for empty required fields
		let rowValid = true;
		for (const required of requiredColumns) {
			const headerKey = required.toLowerCase();
			if (!row[headerKey] || row[headerKey].trim() === '') {
				errors.push(`Row ${lineNum}: Missing required value for '${required}'`);
				rowValid = false;
			}
		}

		if (rowValid) {
			row._rowNumber = lineNum;
			data.push(row);
		}
	}

	return { data, errors, headers };
}

/**
 * Parse a simple single-column CSV (e.g., list of identifiers).
 * @param {string} csvText - Raw CSV content
 * @param {string} columnName - Expected column name (optional, defaults to first column)
 * @returns {{ identifiers: string[], errors: string[] }}
 */
function parseIdentifierCSV(csvText, columnName = null) {
	const errors = [];
	const identifiers = [];

	if (!csvText || typeof csvText !== 'string') {
		errors.push('CSV content is empty or invalid');
		return { identifiers, errors };
	}

	const lines = csvText
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n')
		.split('\n')
		.filter((line) => line.trim().length > 0);

	if (lines.length === 0) {
		errors.push('CSV file is empty');
		return { identifiers, errors };
	}

	// Check if first line is a header
	const firstLine = lines[0].trim().toLowerCase();
	const startIndex = (columnName && firstLine === columnName.toLowerCase()) || 
		['identifier', 'email', 'username', 'id', 'user'].includes(firstLine) ? 1 : 0;

	for (let i = startIndex; i < lines.length; i++) {
		const value = lines[i].trim();
		if (value) {
			identifiers.push(value);
		}
	}

	if (identifiers.length === 0) {
		errors.push('No valid identifiers found in CSV');
	}

	return { identifiers, errors };
}

module.exports = {
	parseCSV,
	parseIdentifierCSV,
	parseLine,
};
