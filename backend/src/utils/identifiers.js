const mongoose = require('mongoose');
const { createPublicId } = require('./publicId');

const isObjectId = (value) => {
	if (!value) return false;
	return mongoose.Types.ObjectId.isValid(value);
};

async function findByIdOrPublicId(Model, idOrPublicId) {
	if (!idOrPublicId) return null;
	if (isObjectId(idOrPublicId)) {
		const doc = await Model.findById(idOrPublicId);
		if (doc) return doc;
	}
	return await Model.findOne({ publicId: idOrPublicId });
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
	findByIdOrPublicId,
	ensureDocumentPublicId,
	ensureDocumentsPublicId,
};
