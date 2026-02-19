// Mock Redis queue module — prevents real Redis connections during tests
const enqueue = jest.fn().mockResolvedValue(undefined);
const removePlayerEverywhere = jest.fn().mockResolvedValue(undefined);
const batchDequeueToPending = jest.fn().mockResolvedValue([]);
const ackFromPending = jest.fn().mockResolvedValue(undefined);
const requeueLeftovers = jest.fn().mockResolvedValue(undefined);
const reclaimPending = jest.fn().mockResolvedValue(undefined);
const removeSnapshotsFromPending = jest.fn().mockResolvedValue(undefined);

module.exports = {
	redis: { quit: jest.fn() },
	enqueue,
	batchDequeueToPending,
	ackFromPending,
	requeueLeftovers,
	reclaimPending,
	removePlayerEverywhere,
	removeSnapshotsFromPending,
};
