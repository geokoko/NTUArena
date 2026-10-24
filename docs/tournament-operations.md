# Tournament Operations Guide

This guide is for running an OTB Arena tournament with NTUArena. The production pairing path today is Arena matchmaking; Swiss is listed in the product roadmap, but Arena is the implemented real-time worker path.

## 1. Install And Start

### Docker setup

Prerequisites:

- Docker
- Docker Compose

From the repository root:

```bash
cp .env.example .env
# Edit .env before exposing the app to players/admins.
docker compose up -d --build
```

Open the app through Nginx:

```text
http://localhost
```

Useful checks:

```bash
docker compose ps
docker compose logs -f backend
```

If you only change environment variables, recreate the backend container:

```bash
docker compose up -d --force-recreate backend
```

If you change `APP_MODE`, rebuild because Docker Compose selects a different frontend Dockerfile and Nginx config:

```bash
docker compose up -d --build
```

### Local script/test setup

Simulation and test scripts run from `backend/`:

```bash
cd backend
npm ci
npm test
```

## 2. Required Environment Decisions

The most important toggles are in `.env`.

| Variable | Local/dev value | Real tournament value | Notes |
|---|---:|---:|---|
| `APP_MODE` | `dev` | `prod` or `dev` | `dev` runs the React dev server. `prod` serves the built frontend through Nginx. |
| `NODE_ENV` | `development` | `production` | Use `production` for public deployments. |
| `AUTH_ENABLED` | `false` | `true` | `false` makes every request act as a mock admin. Useful locally, unsafe publicly. |
| `CORS_ORIGIN` | `*` | your app origin | Example: `https://arena.example.com`. |
| `JWT_SECRET` | dummy value | strong random secret | Generate with `openssl rand -base64 64`. |
| `MONGO_URI` | compose default | production Mongo URI | Mongo must support transactions; the compose setup uses a single-node replica set. |
| `PAIRING_SETTLE_MS` | `30000` | tune per event | Main Arena pairing behavior toggle. See below. |

## 3. Pairing Configuration

### Current production algorithm

Arena pairing uses a graph-based maximum-weight matching engine. The worker builds legal edges between waiting players, scores the edges, and solves the matching using Edmonds blossom matching. The old greedy selector still exists for simulations/tests but is not the production selector.

Hard legality rules:

- No immediate rematch.
- No more than 2 recent meetings against the same opponent.
- Rematches must swap colors when possible.
- Color streak and total color imbalance constraints are enforced.

Soft scoring preferences:

- Similar score/performance.
- Similar rank.
- Similar rating.
- Similar rating deviation, when available.
- Similar berserk/zerk tendency, when available.
- Fewer repeated meetings.
- Relief for players waiting longer.
- Better color balance.

### Settle window

`PAIRING_SETTLE_MS` is the quiet window before the worker pairs the waiting pool.

The waiting pool is read from MongoDB on every worker cycle: every player who is
`active` and not playing is waiting, and `waitingSince` records when they became
available (registration during the event, result, cancellation, or resume).

Example with `PAIRING_SETTLE_MS=30000`:

1. A game result is submitted; both finished players start waiting.
2. The worker waits until 30 seconds have passed since the newest `waitingSince` in the pool.
3. If another player becomes available during that time, the quiet window moves forward.
4. When no player has become available for 30 seconds, graph matching runs on the waiting pool.

The initial tournament pool is treated as already settled, so starting the tournament does not wait 30 seconds before first pairings.

Admins can override the quiet window for a tournament in **Pairing Settings**.
The value is `settleMs` in the API: `null` uses `PAIRING_SETTLE_MS`, `0` disables
the wait, and integers through `600000` are accepted. Changing it takes effect
on the next worker cycle.

Tradeoff:

| Settle value | Expected behavior |
|---:|---|
| `0` to `10000` | More games and short waits, but thinner pairing pools and more low-choice cycles. |
| `20000` to `30000` | Balanced range for many 20-32 player OTB arenas. |
| `45000` and above | Fuller pools and fewer stalled cycles, but lower throughput and more long waits. |

Do not treat these as universal recommendations. Use the Pareto simulation for the expected player count and tournament conditions.

### Other pairing runtime parameters

These are code defaults, not environment toggles today:

| Parameter | Current value | Meaning |
|---|---:|---|
| `batchSize` | `80` | Max waiting players (longest-waiting first) the worker considers in one cycle. |
| `idleMs` | `400` | Sleep time when no pairing work is available. |

## 4. Running A Tournament

A typical OTB Arena flow:

1. Configure `.env` and start Docker Compose.
2. Log in as an admin, or use `AUTH_ENABLED=false` only for local/private testing.
3. Create the tournament as Arena format.
4. Register players manually or import them by CSV.
5. Confirm pairings settings, especially `PAIRING_SETTLE_MS`.
6. Start the tournament from the admin UI. This marks registered players as waiting and starts a tournament worker.
7. Pairings are created automatically as players become available.
8. Enter game results as games finish. Players can finish asynchronously; they do not need to finish in rounds.
9. Pause/withdraw players who leave early so they leave the waiting pool and any active game is handled.
10. Monitor standings, live games, and backend logs for pairing warnings.
11. Stop/complete the tournament from the admin UI when the event is over.

### Entering and correcting results

The Active Games table has one row per board, in board order, up to the
highest board in use. A game keeps its row until it ends; a finished board
below the highest one in use shows as **Free** until the next pairing takes it,
and new boards are added at the bottom. When the highest board finishes, its
row is removed and the rows above it stay where they are. Rows therefore do not
move while new pairings arrive. A game paired while the table is open is
highlighted briefly.

**White wins**, **Black wins** and **Draw** open a confirmation that names the
board and both players. Nothing is saved until **Confirm** is selected, and
the result can still be switched there. The confirmation is tied to the game
that was clicked, even if the list refreshes behind it. For 0.4 s after it
opens, **Confirm**, **Back**, Escape and clicks outside it are ignored, so the
second click of a double-click does nothing. Holding Enter on a result button
does not confirm either: confirming from the keyboard takes a fresh press of
Enter. **Cancel** names the board and players in its prompt as well.

To fix a result that was recorded wrongly, open **Game History** (latest
results first) and select **Edit result**. A correction is allowed in any
tournament status, including after completion. It only moves both players'
score, W/D/L and performance rating, then refreshes the standings. It does not
reopen the game or touch the players' current games or waiting state.
Cancelled games cannot be corrected. Each correction is logged as
`game.result_corrected` with the previous and new result and the admin who
made it. API: `PUT /api/games/:id/result` with `{ "result": "0-1" }`.

If the result was entered on a game that is still being played, select
**Reopen** in Game History instead. It removes the result from both players
(score, W/D/L, games played, performance) and makes the game active again,
with both players back in it. Reopen is only offered while the tournament is
`in progress`, because only then can the freed players be paired into new
games. Once pairing has closed, correct the result when the game ends.

Reopen is refused while either player is already in another game (cancel that
game first) or is paused or withdrawn. It is also refused once either player
has played a newer game that was not cancelled: the game has ended at the
board, so use **Edit result** instead. Cancelling the games paired while the
wrong result stood normally blocks those pairings until each player's next
game; reopening lifts those blocks for both sides. The game keeps its board
unless a new pairing took it; in that case it moves to the lowest free board
and the admin is told the new number. Each reopen is logged as
`game.reopened`. API: `POST /api/games/:id/reopen`.

### Start, close pairing, and finish

Create tournaments with a positive integer `durationMs` and an optional future
`scheduledStartDate`. Leaving the scheduled start empty requires a manual start.
`startDate` and `endDate` are derived; clients must not send `endDate`.
The schedule and duration can only change while the tournament is `upcoming`.

An automatic start keeps the scheduled end (`scheduledStartDate + durationMs`).
A manual start gets the full duration from the time the admin starts it.
`actualStartDate` records when the backend actually performed the transition.

At the end time, or when an admin selects **End Tournament**, pairing closes.
With active games the status becomes `finishing`; results and cancellations
remain available. The last active game's result or cancellation completes the
tournament. New registrations and deletion are rejected while it is finishing.
Pausing or withdrawing a player cancels their active game without scoring it,
rolls back its pairing history, and returns the eligible opponent to the waiting pool.

### Backend recovery

On startup the backend rebuilds schedules, resumes pairing for active events,
ends events whose deadlines have passed, and completes finishing events with
no remaining games. A completely missed scheduled window is closed without
creating pairings. Transient recovery failures are logged and retried after
five seconds. Long schedules are rearmed in chunks to respect Node's timeout
limit. Run a single backend instance: timer and worker ownership remain local
to that process.

### Existing tournaments from before lifecycle controls

Before starting the updated backend against an existing database, back it up
and preview the migration from `backend/`:

```bash
node scripts/migrateTournamentLifecycle.js
# After reviewing the printed IDs and fields:
node scripts/migrateTournamentLifecycle.js --apply
```

Set `MONGO_URI` and `MONGO_DB` for the intended database. The default is a dry
run. The migration fills tournaments missing `durationMs`, derives it from
their existing dates, and preserves existing lifecycle dates. For legacy active
or completed events, their old start date supplies the historical actual start.
It also copies legacy player `liveRating` values into missing or null
`performanceRating` fields for players with completed games, including completed
events and tournaments whose dates were already migrated. Existing performance
ratings are preserved, and players with no games keep a null performance rating
rather than copying their initial entry-rating seed. Legacy `liveRating` fields
remain available for recovery. Invalid legacy windows or nonnumeric legacy
performance values stop both plans before writes. Repeating the command skips
already migrated documents; restoring the backup is the rollback for this data
migration. No database migration runs automatically on backend startup.

Operational notes:

- MongoDB transactions require the replica-set setup; use the provided compose config unless you know your external Mongo supports transactions.
- If the backend logs `no legal pairings available in current pool`, the leftovers stay in the waiting pool and the worker waits for future players/results.
- For a public deployment, do not leave `AUTH_ENABLED=false`, `CORS_ORIGIN=*`, or dummy secrets.

## 5. Testing And Validation

Use Node.js 22 for local installs, matching the Docker images and frontend CI.
The backend test command enables Node's VM modules so Jest can execute the
MongoDB driver's dynamic OS import. Without this, driver 7.6 can produce an
empty handshake and fail replica-set startup with a misleading missing-driver
metadata error ([upstream issue](https://jira.mongodb.org/browse/NODE-7832)).
The frontend chessboard uses the v5 `options`
API. Both manifests and lockfiles include the grouped dependency and security
updates; a fresh `npm ci` is required to replace older installed packages.

Lifecycle unit tests cover timers, restart recovery and state transitions.
`lifecycle.integration.test.js` exercises game creation, closure races, final
results, and pause/cancel rollback against a temporary MongoDB replica set.
The integration tests require permission to bind local sockets. Frontend CI
also installs dependencies, runs component tests, and builds the production app.

Run backend checks from `backend/`:

```bash
cd backend
npm ci

# Full backend test suite
npm test -- --runInBand

# Pairing tests (selector, scorer, worker loop, worker against MongoDB, lifecycle)
npm test -- --runInBand pairing

# Syntax-check simulation tools
node --check test-scripts/simulateArenaPairings.js
node --check test-scripts/simulatePairingComparison.js
node --check test-scripts/simulatePairingPareto.js
```

Run frontend checks from `view/`:

```bash
cd view
npm ci
npm test -- --watchAll=false
npm run build
```

Validate a Docker deployment from the repository root:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f backend
```

`scripts/smoke-test.sh` checks a whole stack without touching your data. It builds
and boots a throwaway compose project from `.env.example` and, through Nginx:
- checks that the frontend is served;
- registers and logs in an account;
- runs a four-player tournament through pairing and results;
- restarts the stack and checks that the standings, the active game and pairing
  survived.

It removes the stack and its volume when it finishes. It uses the same container
names and port 80 as a normal stack, so stop that first. CI runs it for every PR
in prod and dev mode on x64 and arm64, and weekly on master:

```bash
APP_MODE=prod scripts/smoke-test.sh
APP_MODE=dev scripts/smoke-test.sh
```

Before merging pairing changes, run at least:

```bash
cd backend
npm test -- --runInBand
npm run simulate:pairing-comparison -- --players 20 --durationMinutes 60 --settleSeconds 30 --seed 20260519
npm run simulate:pairing-pareto -- --players 12,20 --settleSeconds 10,30 --seedCount 2 --durationMinutes 20
```

## 6. Simulation And Tuning Tools

Run these from `backend/` after `npm ci`.

### Single arena pairing simulation

```bash
npm run simulate:arena-pairings -- --players 20 --rounds 10 --seed 20260419
```

This validates pairing legality over repeated rounds and logs pairings/rule checks.

### One-hour realistic comparison

```bash
npm run simulate:pairing-comparison -- --players 20 --durationMinutes 60 --settleSeconds 30 --seed 20260519
```

Outputs JSON and HTML under `backend/test-output/`. It simulates asynchronous 3+2 game finishes, variance in game duration, and players leaving early.

### Pareto settle-window sweep

```bash
npm run simulate:pairing-pareto
```

Default sweep:

- Player counts: `12,20,32,48,80`
- Settle windows: `0,10,20,30,45,60,90` seconds
- Duration: `60` minutes
- Seeds: `8` deterministic scenarios

Custom sweep:

```bash
npm run simulate:pairing-pareto -- --players 16,20,24 --settleSeconds 10,20,30,45 --seedCount 20 --durationMinutes 60
```

Generated outputs:

- `backend/test-output/pairing-pareto-*.html`: visual report with plots.
- `backend/test-output/pairing-pareto-*.csv`: aggregate table for spreadsheets.
- `backend/test-output/pairing-pareto-*.json`: full machine-readable report.

The Pareto report does not choose a winner. It marks clearly problematic configurations:

- Too few games: more than 15% below the best throughput for the same player count and algorithm.
- Long waits: waits over 8 minutes, frequent waits over 5 minutes, or average wait at least 2.5 minutes.
- Thin queue: average pool below the configured player-count threshold.

Use the non-problematic Pareto points as the discussion set, then choose based on event policy: faster throughput vs fuller pairing choices.
