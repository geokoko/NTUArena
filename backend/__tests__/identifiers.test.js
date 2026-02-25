const mongoose = require('mongoose');
const {
	normalizeLookupId,
	findByIdOrPublicId,
} = require('../src/utils/identifiers');

describe('identifiers utils', () => {
	test('normalizeLookupId accepts non-empty strings and trims whitespace', () => {
		expect(normalizeLookupId('  abc123  ')).toBe('abc123');
		expect(normalizeLookupId('   ')).toBeNull();
	});

	test('normalizeLookupId accepts ObjectId instances', () => {
		const objectId = new mongoose.Types.ObjectId();
		expect(normalizeLookupId(objectId)).toBe(objectId.toString());
	});

	test('findByIdOrPublicId returns null and does not query on invalid object input', async () => {
		const Model = {
			findById: jest.fn(),
			findOne: jest.fn(),
		};

		const result = await findByIdOrPublicId(Model, { $ne: null });

		expect(result).toBeNull();
		expect(Model.findById).not.toHaveBeenCalled();
		expect(Model.findOne).not.toHaveBeenCalled();
	});

	test('findByIdOrPublicId uses $eq for publicId lookup', async () => {
		const Model = {
			findById: jest.fn().mockResolvedValue(null),
			findOne: jest.fn().mockResolvedValue({ publicId: 'abc123' }),
		};

		const result = await findByIdOrPublicId(Model, 'abc123');

		expect(result).toEqual({ publicId: 'abc123' });
		expect(Model.findOne).toHaveBeenCalledWith({ publicId: { $eq: 'abc123' } });
	});
});
