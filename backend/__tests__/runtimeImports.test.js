test('Jest supports the dynamic OS import used by the MongoDB driver', async () => {
	const os = await import('os');
	expect(typeof os.platform()).toBe('string');
	expect(typeof os.arch()).toBe('string');
});
