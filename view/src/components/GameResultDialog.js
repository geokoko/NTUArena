import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './GameResultDialog.css';

export const RESULT_SCORES = { white: '1-0', draw: '½-½', black: '0-1' };

// Ignore a confirm or dismiss that lands right after opening, such as the
// second click of a double-click on the row button underneath the dialog.
export const INPUT_PROTECTION_MS = 400;

export const gamePlayerName = (player) => player?.name || player?.username || 'Unknown';

// "board #3 (Ann vs Bob)", for prompts that must name the exact game.
export const describeGame = (game) => {
	const board = game.boardNumber ? `board #${game.boardNumber}` : 'this game';
	return `${board} (${gamePlayerName(game.playerWhite)} vs ${gamePlayerName(game.playerBlack)})`;
};

const RESULT_OPTIONS = [
	{ value: 'white', outcome: (white) => `${white} wins` },
	{ value: 'draw', outcome: () => 'Draw' },
	{ value: 'black', outcome: (white, black) => `${black} wins` },
];

/**
 * Confirms a result for one game before it is saved. The game is the snapshot
 * taken when the dialog opened, so polling that reorders the list underneath
 * cannot change which game the result goes to. Pass `recordedResult` to
 * correct a finished game instead of scoring an active one.
 */
const GameResultDialog = ({ game, initialResult = null, recordedResult = null, onConfirm, onClose }) => {
	const [result, setResult] = useState(initialResult || recordedResult);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const dialogRef = useRef(null);
	const confirmRef = useRef(null);
	const openedAt = useRef(Date.now());
	const titleId = useId();
	const isCorrection = Boolean(recordedResult);
	const unchanged = isCorrection && result === recordedResult;
	const white = gamePlayerName(game.playerWhite);
	const black = gamePlayerName(game.playerBlack);

	useEffect(() => {
		const previousFocus = document.activeElement;
		(confirmRef.current?.disabled ? dialogRef.current : confirmRef.current)?.focus();
		return () => previousFocus?.focus?.();
	}, []);

	const justOpened = () => Date.now() - openedAt.current < INPUT_PROTECTION_MS;

	const close = () => {
		if (!saving && !justOpened()) onClose();
	};

	const handleBackdropMouseDown = (event) => {
		if (event.target === event.currentTarget) close();
	};

	const handleConfirm = async () => {
		if (saving || !result || unchanged || justOpened()) return;
		setSaving(true);
		setError('');
		try {
			await onConfirm(result);
			onClose();
		} catch (err) {
			setError(err.message || 'Failed to save the result');
			setSaving(false);
		}
	};

	const handleKeyDown = (event) => {
		// Enter held on a row button repeats into the focused Confirm once the
		// opening window has passed. Confirming by keyboard takes a fresh press.
		if (event.key === 'Enter' && event.repeat) {
			event.preventDefault();
			return;
		}
		if (event.key === 'Escape') {
			event.stopPropagation();
			close();
			return;
		}
		if (event.key !== 'Tab') return;
		const focusable = [...dialogRef.current.querySelectorAll('button:not(:disabled)')];
		if (!focusable.length) return;
		const index = focusable.indexOf(document.activeElement);
		const next = event.shiftKey
			? (index <= 0 ? focusable.length - 1 : index - 1)
			: (index + 1) % focusable.length;
		event.preventDefault();
		focusable[next].focus();
	};

	let confirmLabel = `Confirm ${RESULT_SCORES[result] || 'result'}`;
	if (isCorrection) confirmLabel = unchanged ? 'Choose the correct result' : `Change to ${RESULT_SCORES[result]}`;

	// Portal to <body>: cards use transforms and backdrop filters, which would
	// otherwise trap a fixed overlay inside the card.
	return createPortal(
		<div className="result-dialog__backdrop" onMouseDown={handleBackdropMouseDown}>
			<div
				ref={dialogRef}
				className="result-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				tabIndex={-1}
				onKeyDown={handleKeyDown}
			>
				<p className="result-dialog__board">{game.boardNumber ? `Board ${game.boardNumber}` : 'No board'}</p>
				<h2 id={titleId} className="result-dialog__title">{isCorrection ? 'Correct result' : 'Confirm result'}</h2>
				<div className="result-dialog__players">
					<div className="result-dialog__player">
						<span className="result-dialog__color result-dialog__color--white">White</span>
						<strong>{white}</strong>
					</div>
					<div className="result-dialog__player">
						<span className="result-dialog__color result-dialog__color--black">Black</span>
						<strong>{black}</strong>
					</div>
				</div>
				{isCorrection && (
					<p className="result-dialog__note">
						Recorded as {RESULT_SCORES[recordedResult]}. Changing it updates both players&apos; scores and the
						standings. Games the players are in now are not affected.
					</p>
				)}
				<div className="result-dialog__options" role="group" aria-label="Result">
					{RESULT_OPTIONS.map((option) => (
						<button
							key={option.value}
							type="button"
							className={`result-dialog__option${result === option.value ? ' result-dialog__option--selected' : ''}`}
							aria-pressed={result === option.value}
							onClick={() => setResult(option.value)}
							disabled={saving}
						>
							<span className="result-dialog__score">{RESULT_SCORES[option.value]}</span>
							<span className="result-dialog__outcome">{option.outcome(white, black)}</span>
							{option.value === recordedResult && <span className="result-dialog__recorded">Recorded</span>}
						</button>
					))}
				</div>
				{error && <div className="alert alert-danger result-dialog__error" role="alert">{error}</div>}
				<div className="result-dialog__actions">
					<button type="button" className="btn btn-secondary" onClick={close} disabled={saving}>
						Back
					</button>
					<button
						ref={confirmRef}
						type="button"
						className="btn btn-success"
						onClick={handleConfirm}
						disabled={saving || !result || unchanged}
					>
						{saving ? 'Saving…' : confirmLabel}
					</button>
				</div>
			</div>
		</div>,
		document.body,
	);
};

export default GameResultDialog;
