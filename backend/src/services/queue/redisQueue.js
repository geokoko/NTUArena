const IORedis = require('ioredis');

const url = process.env.REDIS_URL || 'redis://localhost:6379'; // dev default
const redis = new IORedis(url, {
  retryStrategy(times) {
    // backoff up to ~3s
    const delay = Math.min(times * 200, 3000);
    return delay;
  },
  maxRetriesPerRequest: null, // avoid unhandled promise rejections on boot
});

redis.on('connect', () => console.log('[redis] connected:', url));
redis.on('error', (e) => console.warn('[redis] error:', e.message));

/**
 * Tournament queue key helpers
 */
const qKey = (tid) => `tq:${tid}`;
const pendingKey = (tid, workerId) => `tq:${tid}:pending:${workerId}`;

/**
 * Enqueue a player snapshot needed for pairing (minimal fields to avoid DB reads).
 * We use RPUSH -> item goes to tail; the head is the longest-waiting.
 */
async function enqueue(tournamentId, playerSnapshot) {
	const payload = JSON.stringify(playerSnapshot);
	await redis.rpush(qKey(tournamentId), payload);
}

/**
 * Atomically move up to N items from the queue HEAD into a worker-local pending list.
 * This prevents losing players if the worker crashes (we can requeue pending on startup).
 */
async function batchDequeueToPending(tournamentId, workerId, n = 50) {
	const src = qKey(tournamentId);
	const dest = pendingKey(tournamentId, workerId);

	// LPOP up to N and RPUSH into pending (preserving order) (using a Lua script)
	const script = `
		local src = KEYS[1]
		local dest = KEYS[2]
		local n = tonumber(ARGV[1])
		local moved = {}
		for i=1,n do
			local v = redis.call('LPOP', src)
			if not v then 
				break 
			end
			redis.call('RPUSH', dest, v)
			table.insert(moved, v)
		end
		return moved
	`;
	const moved = await redis.eval(script, 2, src, dest, n.toString());
	return moved.map(JSON.parse);
}

/**
 * Acknowledge handled snapshots from pending by removing each by exact
 * payload. Removing by count from the head is wrong: pairings are not in
 * head order (Blossom can pair head with tail), so popping N from head
 * removes the wrong entries when some pairs succeed and others fail.
 */
async function ackFromPending(tournamentId, workerId, snapshots) {
	if (!snapshots.length) return;
	const key = pendingKey(tournamentId, workerId);
	const pipe = redis.pipeline();
	for (const snap of snapshots) {
		pipe.lrem(key, 1, JSON.stringify(snap));
	}
	await pipe.exec();
}

/**
 * Requeue the unpaired leftovers from pending back to the main queue (FIFO-safe).
 * Uses a Lua script so each LREM+RPUSH pair is atomic — pipelines are not.
 * Only RPUSH if LREM actually removed an entry: if a concurrent
 * removePlayerEverywhere already evicted the player (e.g. admin paused
 * mid-cycle), don't resurrect them in the main queue.
 */
async function requeueLeftovers(tournamentId, workerId, leftovers) {
	if (!leftovers.length) return;
	const src = pendingKey(tournamentId, workerId);
	const dest = qKey(tournamentId);

	const script = `
		local src = KEYS[1]
		local dest = KEYS[2]
		local moved = 0
		for i=1,#ARGV do
			local removed = redis.call('LREM', src, 1, ARGV[i])
			if removed > 0 then
				redis.call('RPUSH', dest, ARGV[i])
				moved = moved + 1
			end
		end
		return moved
	`;
	const payloads = leftovers.map((p) => JSON.stringify(p));
	await redis.eval(script, 2, src, dest, ...payloads);
}

async function removeFromListByPlayerId(listKey, playerId) {
	const entries = await redis.lrange(listKey, 0, -1);
	if (!entries.length) return 0;
	const id = String(playerId);
	let removed = 0;
	const pipe = redis.pipeline();
	for (const entry of entries) {
		let parsed;
		try {
			parsed = JSON.parse(entry);
		} catch (err) {
			continue;
		}
		if (String(parsed._id) === id) {
			pipe.lrem(listKey, 0, entry);
			removed += 1;
		}
	}
	if (removed > 0) await pipe.exec();
	return removed;
}

async function removePlayerEverywhere(tournamentId, playerId) {
	await removeFromListByPlayerId(qKey(tournamentId), playerId);

	const pattern = `${qKey(tournamentId)}:pending:*`;
	let cursor = '0';
	do {
		const [nextCursor, keys] = await redis.scan(cursor, 'match', pattern, 'count', 50);
		cursor = nextCursor;
		for (const key of keys) {
			await removeFromListByPlayerId(key, playerId);
		}
	} while (cursor !== '0');
}

async function removeSnapshotsFromPending(tournamentId, workerId, snapshots) {
	if (!snapshots.length) return;
	const key = pendingKey(tournamentId, workerId);
	const pipe = redis.pipeline();
	for (const snap of snapshots) {
		const payload = JSON.stringify(snap);
		pipe.lrem(key, 0, payload);
	}
	await pipe.exec();
}

/**
 * On worker (re)start, return any stranded pending items back to main queue.
 */
async function reclaimPending(tournamentId, workerId) {
	const key = pendingKey(tournamentId, workerId);
	// Move all from pending back to main atomically
	const script = `
		local src = KEYS[1]
		local dest = KEYS[2]
		while true do
			local v = redis.call('RPOP', src)
			if not v then 
				break 
			end
			redis.call('LPUSH', dest, v)
		end
		return 1
	`;
	await redis.eval(script, 2, key, qKey(tournamentId));
}

module.exports = {
	redis,
	enqueue,
	batchDequeueToPending,
	ackFromPending,
	requeueLeftovers,
	reclaimPending,
	removePlayerEverywhere,
	removeSnapshotsFromPending,
};
