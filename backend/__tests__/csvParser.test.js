const { parseCSV, parseIdentifierCSV, parseLine } = require('../src/utils/csvParser');

// ─────────────────────────────────────────────
// parseLine
// ─────────────────────────────────────────────
describe('parseLine', () => {
	test('splits simple comma-separated values', () => {
		expect(parseLine('a,b,c')).toEqual(['a', 'b', 'c']);
	});

	test('handles quoted fields', () => {
		expect(parseLine('"hello, world",b')).toEqual(['hello, world', 'b']);
	});

	test('handles escaped quotes inside quoted fields', () => {
		expect(parseLine('"say ""hi""",b')).toEqual(['say "hi"', 'b']);
	});

	test('trims whitespace around fields', () => {
		expect(parseLine('  a , b , c  ')).toEqual(['a', 'b', 'c']);
	});

	test('handles empty fields', () => {
		expect(parseLine('a,,c')).toEqual(['a', '', 'c']);
	});
});

// ─────────────────────────────────────────────
// parseCSV
// ─────────────────────────────────────────────
describe('parseCSV', () => {
	test('parses valid CSV with all required columns', () => {
		const csv = 'username,email\njohn,john@example.com\njane,jane@example.com';
		const result = parseCSV(csv, {
			requiredColumns: ['username', 'email'],
			allowedColumns: ['username', 'email'],
		});

		expect(result.errors).toHaveLength(0);
		expect(result.data).toHaveLength(2);
		expect(result.data[0]).toMatchObject({ username: 'john', email: 'john@example.com' });
		expect(result.data[1]).toMatchObject({ username: 'jane', email: 'jane@example.com' });
		expect(result.headers).toEqual(['username', 'email']);
	});

	test('returns error for missing required column', () => {
		const csv = 'username\njohn';
		const result = parseCSV(csv, { requiredColumns: ['username', 'email'] });

		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors[0]).toContain('Missing required column: email');
	});

	test('returns error for empty/null input', () => {
		expect(parseCSV(null).errors[0]).toContain('empty or invalid');
		expect(parseCSV('').errors[0]).toContain('empty or invalid');
	});

	test('filters out columns not in allowedColumns', () => {
		const csv = 'username,email,secret\njohn,john@x.com,password123';
		const result = parseCSV(csv, {
			requiredColumns: ['username', 'email'],
			allowedColumns: ['username', 'email'],
		});

		expect(result.data[0].secret).toBeUndefined();
	});

	test('reports row with wrong column count', () => {
		const csv = 'username,email\njohn';
		const result = parseCSV(csv, { requiredColumns: ['username', 'email'] });

		expect(result.errors.some(e => e.includes('Expected 2 columns'))).toBe(true);
		expect(result.data).toHaveLength(0);
	});

	test('reports row with missing required value', () => {
		const csv = 'username,email\n,john@x.com';
		const result = parseCSV(csv, {
			requiredColumns: ['username', 'email'],
			allowedColumns: ['username', 'email'],
		});

		expect(result.errors.some(e => e.includes("Missing required value for 'username'"))).toBe(true);
	});

	test('handles \\r\\n line endings', () => {
		const csv = 'username,email\r\njohn,john@x.com\r\njane,jane@x.com';
		const result = parseCSV(csv, { requiredColumns: ['username', 'email'] });

		expect(result.data).toHaveLength(2);
	});

	test('adds _rowNumber to data rows', () => {
		const csv = 'username,email\njohn,j@x.com';
		const result = parseCSV(csv, { requiredColumns: ['username', 'email'] });

		expect(result.data[0]._rowNumber).toBe(2);
	});

	test('skips blank lines', () => {
		const csv = 'username,email\n\njohn,j@x.com\n\n';
		const result = parseCSV(csv, { requiredColumns: ['username', 'email'] });

		expect(result.data).toHaveLength(1);
	});
});

// ─────────────────────────────────────────────
// parseIdentifierCSV
// ─────────────────────────────────────────────
describe('parseIdentifierCSV', () => {
	test('parses simple list of identifiers', () => {
		const csv = 'identifier\njohn\njane';
		const result = parseIdentifierCSV(csv);

		expect(result.identifiers).toEqual(['john', 'jane']);
		expect(result.errors).toHaveLength(0);
	});

	test('auto-detects header row and skips it', () => {
		const csv = 'username\nalice\nbob';
		const result = parseIdentifierCSV(csv);

		expect(result.identifiers).toEqual(['alice', 'bob']);
	});

	test('includes all lines when no header detected', () => {
		const csv = 'alice\nbob';
		const result = parseIdentifierCSV(csv);

		expect(result.identifiers).toEqual(['alice', 'bob']);
	});

	test('returns error for empty input', () => {
		const result = parseIdentifierCSV('');
		expect(result.errors.length).toBeGreaterThan(0);
	});

	test('returns error when no valid identifiers found', () => {
		const csv = 'identifier\n\n  \n';
		const result = parseIdentifierCSV(csv);

		// Only the header line, rest are blank
		expect(result.errors.some(e => e.includes('No valid identifiers'))).toBe(true);
	});
});
