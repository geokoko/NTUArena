import React, { useMemo, useRef, useState } from 'react';
import GameResultDialog, { describeGame, gamePlayerName } from './GameResultDialog';
import './ActiveGamesTable.css';

/**
 * Lays active games out by board, with an empty row for every free board below
 * the highest one in use. A game keeps its row until it ends: new pairings
 * fill a free row or extend the table at the bottom instead of pushing the
 * other rows around while an admin is aiming at a result button.
 */
export const arrangeBoards = (games) => {
	const byBoard = new Map();
	const unnumbered = [];
	for (const game of games) {
		const board = Number(game.boardNumber);
		if (Number.isInteger(board) && board > 0 && !byBoard.has(board)) byBoard.set(board, game);
		else unnumbered.push(game);
	}

	const rows = [];
	const lastBoard = Math.max(0, ...byBoard.keys());
	for (let board = 1; board <= lastBoard; board += 1) {
		rows.push({ board, game: byBoard.get(board) || null });
	}
	unnumbered
		.sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt))
		.forEach((game) => rows.push({ board: null, game }));
	return rows;
};

const formatTime = (value) => {
	const date = new Date(value);
	if (!value || Number.isNaN(date.getTime())) return '—';
	return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const RESULT_BUTTONS = [
	{ result: 'white', label: 'White wins', className: 'btn-success active-games__result-btn--white' },
	{ result: 'black', label: 'Black wins', className: 'btn-dark active-games__result-btn--black' },
	{ result: 'draw', label: 'Draw', className: 'btn-secondary active-games__result-btn--draw' },
];

const ActiveGamesTable = ({ games, canManage = false, onSubmitResult, onCancelGame, disabled = false, tableClassName = '' }) => {
	const [pending, setPending] = useState(null);
	// Games already listed when the table first renders are not flagged as new.
	const initialIds = useRef(null);
	if (initialIds.current === null) initialIds.current = new Set(games.map((game) => game.id));
	const rows = useMemo(() => arrangeBoards(games), [games]);

	const confirmCancel = (game) => {
		if (!window.confirm(`Cancel ${describeGame(game)}? It will not be scored, both players go back to waiting, and this cannot be undone.`)) return;
		onCancelGame(game.id);
	};

	return (
		<>
			{rows.length === 0 ? (
				<p className="text-muted text-center active-games__empty">No active games at the moment.</p>
			) : (
				<div className="table-responsive">
					<table className={`table table-sm align-middle active-games ${tableClassName}`}>
						<thead>
							<tr>
								<th>Board</th>
								<th>White</th>
								<th>Black</th>
								<th>Started</th>
								{canManage && <th className="text-end">Set Result</th>}
							</tr>
						</thead>
						<tbody>
							{rows.map(({ board, game }) => (game ? (
								<tr key={game.id} className={initialIds.current.has(game.id) ? undefined : 'active-games__row--new'}>
									<td className="active-games__board">{board ? `#${board}` : '—'}</td>
									<td>{gamePlayerName(game.playerWhite)}</td>
									<td>{gamePlayerName(game.playerBlack)}</td>
									<td>{formatTime(game.startedAt)}</td>
									{canManage && (
										<td className="text-end">
											<div className="active-games__actions">
												{RESULT_BUTTONS.map((button) => (
													<button
														key={button.result}
														type="button"
														className={`btn btn-sm active-games__result-btn ${button.className}`}
														onClick={() => setPending({ game, result: button.result })}
														disabled={disabled}
													>
														{button.label}
													</button>
												))}
												<button
													type="button"
													className="btn btn-sm btn-outline-danger active-games__result-btn"
													onClick={() => confirmCancel(game)}
													disabled={disabled}
												>
													Cancel
												</button>
											</div>
										</td>
									)}
								</tr>
							) : (
								<tr key={`free-${board}`} className="active-games__row--free">
									<td className="active-games__board">#{board}</td>
									<td colSpan={canManage ? 4 : 3}>Free</td>
								</tr>
							)))}
						</tbody>
					</table>
				</div>
			)}
			{pending && (
				<GameResultDialog
					game={pending.game}
					initialResult={pending.result}
					onConfirm={(result) => onSubmitResult(pending.game.id, result)}
					onClose={() => setPending(null)}
				/>
			)}
		</>
	);
};

export default ActiveGamesTable;
