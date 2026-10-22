const { escapeRegex, exactCaseInsensitive } = require('../src/utils/escapeRegex');

describe('escapeRegex utils', () => {
	test('escapeRegex escapes every regex metacharacter', () => {
		const special = '.*+?^${}()|[]\\';
		expect(new RegExp(`^${escapeRegex(special)}$`).test(special)).toBe(true);
	});

	test('exactCaseInsensitive matches the literal string only', () => {
		expect(exactCaseInsensitive('J.Doe@Club.gr').test('j.doe@club.gr')).toBe(true);
		expect(exactCaseInsensitive('j.doe@club.gr').test('j_doe@club.gr')).toBe(false);
		expect(exactCaseInsensitive('.*').test('anyone')).toBe(false);
		expect(exactCaseInsensitive('(a+)+$').test('(a+)+$')).toBe(true);
	});
});
