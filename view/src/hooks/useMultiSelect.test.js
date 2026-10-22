import { act } from 'react';
import { renderHook } from '@testing-library/react';
import useMultiSelect from './useMultiSelect';

const items = [
	{ id: 'a' },
	{ id: 'b' },
	{ id: 'c' },
	{ id: 'd' },
];

test('selects one item on plain click', () => {
	const { result } = renderHook(() => useMultiSelect(items));

	act(() => {
		result.current.handleSelect('b', {});
	});

	expect(result.current.selectedIds).toEqual(['b']);
});

test('toggles with ctrl click', () => {
	const { result } = renderHook(() => useMultiSelect(items));

	act(() => {
		result.current.handleSelect('b', {});
		result.current.handleSelect('c', { ctrlKey: true });
		result.current.handleSelect('b', { ctrlKey: true });
	});

	expect(result.current.selectedIds).toEqual(['c']);
});

test('range selects with shift click from anchor', () => {
	const { result } = renderHook(() => useMultiSelect(items));

	act(() => {
		result.current.handleSelect('a', {});
	});
	act(() => {
		result.current.handleSelect('d', { shiftKey: true });
	});

	expect(result.current.selectedIds).toEqual(['a', 'b', 'c', 'd']);
});
