const mongoose = require('mongoose');

async function connectDB() {
	const uri = process.env.MONGO_URI || 'mongodb://monolith_db:27017/arena_monolith';
	mongoose.set('strictQuery', true);
	await mongoose.connect(uri, { dbName: process.env.MONGO_DB || 'arena_monolith' });
	console.log('Mongo connected:', uri);
}

module.exports = connectDB;

