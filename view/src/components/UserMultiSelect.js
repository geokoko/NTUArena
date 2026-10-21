import React, { useMemo, useState } from 'react';
import { getDisplayName } from '../utils/tournamentDisplay';
import useMultiSelect from '../hooks/useMultiSelect';
import './UserMultiSelect.css';

const UserMultiSelect = ({ users, registeredUserIds, onAdd, disabled }) => {
	const [filter, setFilter] = useState('');
	const [result, setResult] = useState(null);
	const [error, setError] = useState('');
	const [adding, setAdding] = useState(false);
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
	const selectedIds = selection.selectedIds.filter((id) => !registered.has(id));
	const selectedCount = selectedIds.length;
	const busy = disabled || adding;

	const handleAdd = async () => {
		if (!selectedCount || busy) return;
		setAdding(true);
		setError('');
		setResult(null);
		try {
			const outcome = await onAdd(selectedIds);
			if (!outcome || !['added', 'skipped', 'errors'].every((key) => Array.isArray(outcome[key]))) {
				throw new Error('Could not read registration results. Refresh participants before retrying.');
			}
			setResult(outcome);
			const addedIds = new Set(outcome.added.map((item) => String(item.userId)));
			selection.setSelectedIds((previous) => previous.filter((id) => !addedIds.has(id)));
		} catch (err) {
			setError(err.message || 'Failed to add players');
		} finally {
			setAdding(false);
		}
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
				<button type="button" className="btn btn-sm btn-outline-secondary" onClick={selection.selectAll} disabled={busy || selectableUsers.length === 0}>
					Select all
				</button>
				<button type="button" className="btn btn-sm btn-outline-secondary" onClick={selection.clear} disabled={busy || selectedCount === 0}>
					Clear
				</button>
			</div>
			<div className="user-multi-select__list" role="listbox" aria-multiselectable="true">
				{visibleUsers.map((user) => {
					const id = String(user.id);
					const isRegistered = registered.has(id);
					const selected = !isRegistered && selection.selectedSet.has(id);
					return (
						<button
							type="button"
							key={id}
							className={`user-multi-select__row${selected ? ' user-multi-select__row--selected' : ''}`}
							onClick={(event) => !isRegistered && selection.handleSelect(id, event)}
							disabled={busy || isRegistered}
							role="option"
							aria-selected={selected}
						>
							<span>{getDisplayName(user)}</span>
							{selected && <span className="user-multi-select__pill" aria-hidden="true">selected</span>}
							{isRegistered && <span className="user-multi-select__pill">registered</span>}
						</button>
					);
				})}
			</div>
			<div className="user-multi-select__footer">
				<span>{selectedCount} selected</span>
				<button type="button" className="btn btn-sm btn-primary" onClick={handleAdd} disabled={busy || selectedCount === 0}>
					{adding ? 'Adding…' : 'Add selected'}
				</button>
			</div>
			{error && <div className="alert alert-danger mb-0" role="alert">{error} Your selection has been kept.</div>}
			{result && (
				<div className={`alert ${result.skipped.length || result.errors.length ? 'alert-warning' : 'alert-success'} mb-0`} role="status">
					<div>{result.added.length} added, {result.skipped.length} skipped, {result.errors.length} failed.</div>
					{(result.skipped.length > 0 || result.errors.length > 0) && (
						<ul className="mb-0">
							{[...result.skipped, ...result.errors].map((item, index) => {
								const user = users.find((candidate) => String(candidate.id) === String(item.userId));
								return <li key={`${item.userId}-${index}`}>{user ? getDisplayName(user) : item.userId}: {item.reason || item.error}</li>;
							})}
						</ul>
					)}
				</div>
			)}
		</div>
	);
};

export default UserMultiSelect;
