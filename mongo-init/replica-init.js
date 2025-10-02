const adminDb = db.getSiblingDB("admin"); 

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function initiateReplicaSet() {
	const maxRetries = 15;
	const retryDelay = 2000; // milliseconds
	let attempt = 0;

	while (attempt < maxRetries) {
		try {
			const attemptNumber = attempt + 1;
			console.log(`Attempt ${attemptNumber} to initiate replica set...`);

			rs.initiate({
				_id: "rs0",
				members: [
					{ _id: 0, host: "mongo:27017" },
				],
			});

			console.log("Replica set initiated!");
			return;
		} catch (e) {
			if (e.codeName === "AlreadyInitialized" || /already initialized/i.test(e.message)) {
				console.log("Replica set already initialized.");
				return;
			}

			const attemptNumber = attempt + 1;
			console.error(`Attempt ${attemptNumber} failed to initiate replica set: ${e}`);
			attempt += 1;

			if (attempt >= maxRetries) {
				print("FAILED !!! to initiate replica set after maximum retries.");
				throw e;
			}

			await sleep(retryDelay);
		}
	}
}

initiateReplicaSet();
