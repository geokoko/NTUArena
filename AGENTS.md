# NTUArena

Arena is the implemented tournament format; Swiss remains roadmap-only.
For setup, runtime architecture, pairing behavior and simulation tools, see
[README.md](README.md) and [Tournament Operations Guide](docs/tournament-operations.md).

## Contracts and operational boundaries

- Public API `id` values come from `publicId`; internal relations use MongoDB
  ObjectIds. Preserve dual ID/publicId lookup through `backend/src/utils/identifiers.js`.
- User deletion is soft deletion: `isDeleted=true`, `isActive=false`, and
  `deletedAt` in `backend/src/models/User.js` and `backend/src/services/userService.js`.
- Self-registration assigns the `player` role in `backend/src/services/authService.js`.
- `AUTH_ENABLED=false` bypasses authentication and role checks, including mock
  admin access. Both `backend/src/middleware/auth.js` and `view/src/contexts/AuthContext.js`
  implement this mode.
- User-supplied strings used in MongoDB regex lookups must go through
  `backend/src/utils/escapeRegex.js`.
- Browser traffic goes through Nginx: `/api/*` and `/health` reach the backend.
  `APP_MODE=dev|prod` selects the frontend and proxy configuration in `docker-compose.yml`.
- The app is deployed on localhost only, so all clients share one rate-limit key
  (no `trust proxy`; traffic arrives from Nginx). This is accepted; do not report
  the shared budget or polling load against it as a bug.
- Run a single backend instance: tournament scheduler timers
  (`backend/src/services/tournamentScheduler.js`) and pairing workers are owned by
  that process. MongoDB must be a replica set because game creation and results use transactions.
- MongoDB is the only store for the pairing pool. A player is waiting when
  `status: 'active'` and `isPlaying: false`; `backend/src/services/pairing/pairingWorker.js`
  reads that pool every cycle. Pause, resume, results and cancellations only update
  the `Player`. Do not reintroduce a second copy of player state (such as a queue)
  that must be kept in sync. `createGameFromPairing` in `backend/src/services/gameService.js`
  re-checks availability inside its transaction.
- `colorHistory[i]` and `recentOpponents[i]` describe the same game, and the scorer
  relies on that alignment. A cancelled game is rolled back from both; a manual
  cancellation blocks the rejected pairing through `lastCancelledOpponent` until the
  player's next game.
- A result correction (`correctGameResult`, `PUT /api/games/:id/result`) only swaps
  score, W/D/L and performance for both players. It must not touch `isPlaying`,
  `waitingSince` or pairing history: by then the players may be in newer games.
  Reopening (`reopenGame`) is the inverse of a result. It is only allowed while the
  tournament is `in progress` and both players are active and idle, and it writes
  the tournament document so that it serializes with pairing and closing.
- `backend/scripts/migrateTournamentLifecycle.js` never runs automatically. It makes
  legacy upcoming tournaments manual-start by design (`scheduledStartDate: null`);
  `backend/__tests__/lifecycleMigration.test.js` pins this.
- Both `view/src/pages/TournamentDetail.js` and `view/src/pages/TournamentManage.js`
  contain admin tournament controls; keep their behavior consistent.
- `docs/api/grouping.txt` is historical. Current API routes are in `backend/src/routes/`;
  the frontend API wrapper is `view/src/services/api.js`.

## Validation

- In `backend/`: `npm test`. `backend/jest.config.js` replaces the pairing service
  with a mock; the suite uses `mongodb-memory-server` via `backend/__tests__/setup.js`.
  `backend/__tests__/pairingWorker.integration.test.js` runs the real worker against it.
- CI runs the backend suite in the Dockerfile's `test` stage:
  `docker build --target test backend` and run the image.
- `NODE_ENV=test` disables backend rate limiting in `backend/src/app.js`; tests do not validate throttling.
- In `view/`: `npm test -- --watchAll=false` and `npm run build`.
- From the repository root: `docker compose up -d --build` starts the full stack.
