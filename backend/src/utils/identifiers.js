const mongoose = require('mongoose');
const { createPublicId } = require('./publicId');

const isObjectId = (value) => {
	if (!value) return false;
	if (typeof value === 'string') {
		return mongoose.Types.ObjectId.isValid(value);
	}
	if (value instanceof mongoose.Types.ObjectId) {
		return true;
	}
	return false;
};

const normalizeLookupId = (value) => {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		return trimmed.length ? trimmed : null;
	}
	if (value instanceof mongoose.Types.ObjectId) {
		return value.toString();
	}
	return null;
};

async function findByIdOrPublicId(Model, idOrPublicId) {
	const lookupId = normalizeLookupId(idOrPublicId);
	if (!lookupId) return null;
	if (isObjectId(lookupId)) {
		const doc = await Model.findById(lookupId);
		if (doc) return doc;
	}
	return await Model.findOne({ publicId: { $eq: lookupId } });
}

async function ensureDocumentPublicId(doc, Model) {
	if (!doc) return doc;
	if (doc.publicId) return doc;
	const publicId = createPublicId();
	await Model.updateOne({ _id: doc._id }, { $set: { publicId } });
	if (typeof doc.set === 'function') {
		doc.set('publicId', publicId);
		return doc;
	}
	return { ...doc, publicId };
}

async function ensureDocumentsPublicId(docs, Model) {
	if (!Array.isArray(docs)) return docs;
	return Promise.all(docs.map((doc) => ensureDocumentPublicId(doc, Model)));
}

module.exports = {
	isObjectId,
	normalizeLookupId,
	findByIdOrPublicId,
	ensureDocumentPublicId,
	ensureDocumentsPublicId,
};
