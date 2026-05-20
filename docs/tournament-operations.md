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
| `REDIS_PASSWORD` | dummy value | strong password | Must match `REDIS_URL`. |
| `REDIS_URL` | compose default | password-protected Redis URL | Required for pairing queues. |
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

Example with `PAIRING_SETTLE_MS=30000`:

1. A game result is submitted.
2. Finished players are re-enqueued after the result handling delay.
3. The worker waits until 30 seconds have passed since the newest queued player.
4. If another player enters the queue during that time, the quiet window moves forward.
5. When the queue has been quiet for 30 seconds, graph matching runs on the available pool.

The initial tournament pool is treated as already settled, so starting the tournament does not wait 30 seconds before first pairings.

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
| `batchSize` | `80` | Max queued player snapshots the worker considers in one cycle. |
| `idleMs` | `400` | Sleep time when no pairing work is available. |
| `REQUEUE_DELAY_MS` | `5000` | Delay after result submission before players return to the queue. |

## 4. Running A Tournament

A typical OTB Arena flow:

1. Configure `.env` and start Docker Compose.
2. Log in as an admin, or use `AUTH_ENABLED=false` only for local/private testing.
3. Create the tournament as Arena format.
4. Register players manually or import them by CSV.
5. Confirm pairings settings, especially `PAIRING_SETTLE_MS`.
6. Start the tournament from the admin UI. This seeds the Redis pairing queue and starts a tournament worker.
7. Pairings are created automatically as players become available.
8. Enter game results as games finish. Players can finish asynchronously; they do not need to finish in rounds.
9. Pause/withdraw players who leave early so they are removed from the pairing queue and any active game is handled.
10. Monitor standings, live games, and backend logs for pairing warnings.
11. Stop/complete the tournament from the admin UI when the event is over.

Operational notes:

- Redis must be healthy before pairing can work.
- MongoDB transactions require the replica-set setup; use the provided compose config unless you know your external Mongo supports transactions.
- If the backend logs `no legal pairings available in current pool`, the worker requeues leftovers and waits for future players/results.
- For a public deployment, do not leave `AUTH_ENABLED=false`, `CORS_ORIGIN=*`, or dummy secrets.

## 5. Testing And Validation

Run backend checks from `backend/`:

```bash
cd backend
npm ci

# Full backend test suite
CORS_ORIGIN=http://localhost APP_MODE=test NODE_ENV=test npm test -- --runInBand

# Pairing-focused regression tests
npm test -- --runInBand pairingWorker.test.js

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

Before merging pairing changes, run at least:

```bash
cd backend
CORS_ORIGIN=http://localhost APP_MODE=test NODE_ENV=test npm test -- --runInBand
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
