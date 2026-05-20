import { useCallback, useMemo, useState } from 'react';

const itemId = (item, idKey) => String(typeof idKey === 'function' ? idKey(item) : item?.[idKey]);

const useMultiSelect = (items, idKey = 'id') => {
	const [selectedIds, setSelectedIds] = useState([]);
	const [anchorId, setAnchorId] = useState(null);

	const visibleIds = useMemo(() => items.map((item) => itemId(item, idKey)).filter(Boolean), [items, idKey]);
	const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

	const clear = useCallback(() => {
		setSelectedIds([]);
		setAnchorId(null);
	}, []);

	const selectAll = useCallback(() => {
		setSelectedIds(visibleIds);
		setAnchorId(visibleIds[0] || null);
	}, [visibleIds]);

	const handleSelect = useCallback((id, event = {}) => {
		const normalizedId = String(id);
		const isRange = event.shiftKey && anchorId;
		const isToggle = event.ctrlKey || event.metaKey;

		setSelectedIds((prev) => {
			if (isRange) {
				const start = visibleIds.indexOf(anchorId);
				const end = visibleIds.indexOf(normalizedId);
				if (start >= 0 && end >= 0) {
					const [from, to] = start < end ? [start, end] : [end, start];
					return Array.from(new Set([...prev, ...visibleIds.slice(from, to + 1)]));
				}
			}
			if (isToggle) {
				return prev.includes(normalizedId)
					? prev.filter((selectedId) => selectedId !== normalizedId)
					: [...prev, normalizedId];
			}
			return [normalizedId];
		});
		setAnchorId(normalizedId);
	}, [anchorId, visibleIds]);

	return {
		selectedIds,
		selectedSet,
		clear,
		selectAll,
		handleSelect,
		setSelectedIds,
	};
};

export default useMultiSelect;
