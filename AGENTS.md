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
- Browser traffic goes through Nginx: `/api/*` and `/health` reach the backend.
  `APP_MODE=dev|prod` selects the frontend and proxy configuration in `docker-compose.yml`.
- Redis pending-list acknowledgement and reclaim preserve dequeued players across
  worker failures; see `backend/src/services/queue/redisQueue.js` and
  `backend/src/services/pairing/pairingWorker.js`.
- Both `view/src/pages/TournamentDetail.js` and `view/src/pages/TournamentManage.js`
  contain admin tournament controls; keep their behavior consistent.
- `docs/api/grouping.txt` is historical. Current API routes are in `backend/src/routes/`;
  the frontend API wrapper is `view/src/services/api.js`.

## Validation

- In `backend/`: `npm test`. `backend/jest.config.js` replaces Redis queues and
  pairing services with mocks; the suite uses `mongodb-memory-server` via
  `backend/__tests__/setup.js`. These tests do not exercise live Redis workers.
- `NODE_ENV=test` disables backend rate limiting in `backend/src/app.js`; tests do not validate throttling.
- In `view/`: `npm test -- --watchAll=false` and `npm run build`.
- From the repository root: `docker compose up -d --build` starts the full stack.
