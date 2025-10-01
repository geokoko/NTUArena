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
 * Acknowledge N items from pending (remove from head).
 */
async function ackFromPending(tournamentId, workerId, n) {
	const key = pendingKey(tournamentId, workerId);
	// Trim from head by popping n items
	const pipeline = redis.pipeline();
	for (let i = 0; i < n; i++) pipeline.lpop(key);
	await pipeline.exec();
}

/**
 * Requeue the unpaired leftovers from pending back to the main queue (FIFO-safe).
 * We LREM those items from pending (by value) and RPUSH to main queue keeping order.
 */
async function requeueLeftovers(tournamentId, workerId, leftovers) {
	if (!leftovers.length) return;
	const key = pendingKey(tournamentId, workerId);
	const main = qKey(tournamentId);
	const pipe = redis.pipeline();

	// Remove by value (LREM count 1) for each leftover and then RPUSH to main queue
	for (const p of leftovers) {
		const payload = JSON.stringify(p);
		pipe.lrem(key, 1, payload);
		pipe.rpush(main, payload);
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
	enqueue,
	batchDequeueToPending,
	ackFromPending,
	requeueLeftovers,
	reclaimPending,
};

