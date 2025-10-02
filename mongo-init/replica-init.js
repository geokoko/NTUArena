try {
	rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "mongodb:27017" }] });
} catch (e) { /* already initiated */ }

