import React, { useMemo, useState } from 'react';
import { getDisplayName } from '../utils/tournamentDisplay';
import useMultiSelect from '../hooks/useMultiSelect';
import './UserMultiSelect.css';

const UserMultiSelect = ({ users, registeredUserIds, onAdd, disabled }) => {
	const [filter, setFilter] = useState('');
	const registered = useMemo(() => new Set(registeredUserIds.map(String)), [registeredUserIds]);
	const visibleUsers = useMemo(() => {
		const q = filter.trim().toLowerCase();
		return users.filter((user) => {
			const haystack = `${getDisplayName(user)} ${user.username || ''} ${user.email || ''}`.toLowerCase();
			return !q || haystack.includes(q);
		});
	}, [filter, users]);
	const selectableUsers = visibleUsers.filter((user) => !registered.has(String(user.id)));
	const selection = useMultiSelect(selectableUsers, 'id');
	const selectedCount = selection.selectedIds.length;

	const handleAdd = async () => {
		if (!selectedCount) return;
		await onAdd(selection.selectedIds);
		selection.clear();
	};

	return (
		<div className="user-multi-select">
			<input
				type="search"
				className="form-control form-control-sm user-multi-select__filter"
				placeholder="Filter users"
				value={filter}
				onChange={(event) => setFilter(event.target.value)}
			/>
			<div className="user-multi-select__toolbar">
				<button type="button" className="btn btn-sm btn-outline-secondary" onClick={selection.selectAll} disabled={disabled || selectableUsers.length === 0}>
					Select all
				</button>
				<button type="button" className="btn btn-sm btn-outline-secondary" onClick={selection.clear} disabled={disabled || selectedCount === 0}>
					Clear
				</button>
			</div>
			<div className="user-multi-select__list" role="listbox" aria-multiselectable="true">
				{visibleUsers.map((user) => {
					const id = String(user.id);
					const isRegistered = registered.has(id);
					const selected = selection.selectedSet.has(id);
					return (
						<button
							type="button"
							key={id}
							className={`user-multi-select__row${selected ? ' user-multi-select__row--selected' : ''}`}
							onClick={(event) => !isRegistered && selection.handleSelect(id, event)}
							disabled={disabled || isRegistered}
							role="option"
							aria-selected={selected}
						>
							<span>{getDisplayName(user)}</span>
							{isRegistered && <span className="user-multi-select__pill">registered</span>}
						</button>
					);
				})}
			</div>
			<div className="user-multi-select__footer">
				<span>{selectedCount} selected</span>
				<button type="button" className="btn btn-sm btn-primary" onClick={handleAdd} disabled={disabled || selectedCount === 0}>
					Add selected
				</button>
			</div>
		</div>
	);
};

export default UserMultiSelect;
