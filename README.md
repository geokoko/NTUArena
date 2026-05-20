<p align="center">
  <img src="assets/logo.png" alt="NTUArena Logo" width="200" />
</p>

<h1 align="center">NTUArena</h1>

<p align="center">
  <strong>Real-time OTB chess tournament management platform</strong><br>
  Arena-style tournaments with automated pairing, live standings, and rating/performance tracking
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node.js" />
  <img src="https://img.shields.io/badge/react-18-blue" alt="React" />
  <img src="https://img.shields.io/badge/mongodb-7-green" alt="MongoDB" />
  <img src="https://img.shields.io/badge/docker-compose-2496ED" alt="Docker" />
</p>

---

## About

NTUArena is a web application built for **Skaki NTUA - Le Roi**, the chess club of the National Technical University of Athens. It manages over-the-board chess tournaments with automated Arena pairings, live standings, player statistics, result submission, and rating/performance tracking.

Arena is the complete real-time tournament path today. Swiss is still a roadmap item and should not be treated as production-ready pairing behavior.

<p align="center">
  <img src="assets/le-roi-logo.png" alt="Skaki NTUA - Le Roi" width="120" />
  <br>
  <em>Powered by Skaki NTUA - Le Roi</em>
</p>

## Features

- **Tournament Management** - Create, start, monitor, and complete OTB tournaments.
- **Arena Pairing Worker** - Redis-backed real-time queue with graph matching for available players.
- **Graph-Based Pairing** - Maximum-weight matching over legal player-pair edges using Edmonds blossom matching.
- **Pairing Controls** - Tune the Arena settle window with `PAIRING_SETTLE_MS` and validate choices with simulation/Pareto reports.
- **Live Standings** - Real-time leaderboard updates during tournaments.
- **Game Result Submission** - Admin result entry updates stats, ratings, histories, and pairing eligibility.
- **Player Management** - Register users, import participants by CSV, pause/withdraw players who leave early.
- **Role-Based Access** - Admin, player, and spectator roles with JWT authentication.
- **Responsive UI** - Works on desktop and mobile browsers.

## Important Docs

- [Tournament Operations Guide](docs/tournament-operations.md): how to install, configure, tune pairing, and run an OTB Arena tournament.
- [Testing and validation](docs/tournament-operations.md#5-testing-and-validation): backend tests, frontend checks, Docker health checks, and script validation.
- [Pairing simulation tools](docs/tournament-operations.md#6-simulation-and-tuning-tools): one-hour simulations, Pareto plots, CSV/JSON/HTML outputs.
- [Environment decisions](docs/tournament-operations.md#2-required-environment-decisions): deployment and tournament toggles.

## Tech Stack - Containers

| Layer | Technology |
|-------|-----------|
| **Frontend** | React, React Router |
| **Backend** | Node.js, Express |
| **Database** | MongoDB |
| **Queue/Cache** | Redis |
| **Reverse Proxy** | Nginx |
| **Containerization** | Docker Compose |

## High-Level Architecture

```text
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────>│    Nginx    │────>│   React     │
│             │     │  (port 80)  │     │  Frontend   │
└─────────────┘     │             │     └─────────────┘
                    │  /api/ ───> │     ┌─────────────┐
                    │             │────>│   Express   │
                    └─────────────┘     │   Backend   │
                                        │  (port 5000)│
                                        └──────┬──────┘
                                               │
                                    ┌──────────┴─────────┐
                                    │                    │
                              ┌─────┴─────┐         ┌────┴────┐
                              │  MongoDB  │         │  Redis  │
                              │ (replica) │         │ (queue) │
                              └───────────┘         └─────────┘
```

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/ArenaManager.git
cd ArenaManager
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` before running a real tournament. At minimum, decide the app mode, auth mode, CORS origin, secrets, database/Redis credentials, and Arena pairing settle window.

### 3. Start the application

```bash
docker compose up -d --build
```

### 4. Open in browser

```text
http://localhost
```

For a complete operator checklist, see [Tournament Operations Guide](docs/tournament-operations.md).

## Configuration Quick Reference

These are the variables most likely to affect deployment and tournament behavior.

| Variable | Purpose | Common values |
|----------|---------|---------------|
| `APP_MODE` | Selects frontend/Nginx mode | `dev`, `prod` |
| `NODE_ENV` | Backend runtime mode | `development`, `production`, `test` |
| `AUTH_ENABLED` | Enables real JWT auth | `false` for local/private tests, `true` for real/public use |
| `CORS_ORIGIN` | Allowed browser origin | `*` locally, exact public origin in production |
| `JWT_SECRET` | JWT signing secret | Generate a strong value for production |
| `MONGO_URI` | Mongo connection string | Compose default or production Mongo URI |
| `REDIS_URL` | Redis connection string | Required for pairing queue |
| `PAIRING_SETTLE_MS` | Quiet window before Arena pairing | `10000`, `20000`, `30000`, `45000` |

`PAIRING_SETTLE_MS` is the main pairing behavior toggle. Lower values create faster pairings with thinner waiting pools. Higher values create fuller pools for graph matching but can reduce games played and increase long waits. The default is `30000`.

Full details: [Pairing Configuration](docs/tournament-operations.md#3-pairing-configuration).

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_MODE` | `dev` or `prod`; selects Dockerfile and Nginx config | `dev` |
| `PORT` | Backend server port | `5000` |
| `NODE_ENV` | Node environment | `development` |
| `AUTH_ENABLED` | Enable JWT authentication. If `false`, backend injects a mock admin user. | `false` |
| `JWT_SECRET` | Secret key for JWT tokens | change in production |
| `JWT_EXPIRES_IN` | Token expiration time | `7d` |
| `MONGO_DB` | MongoDB database name | `ntuarena` |
| `MONGO_URI` | MongoDB connection string | `mongodb://mongo:27017/ntuarena?replicaSet=rs0` |
| `REDIS_PASSWORD` | Redis password | change in production |
| `REDIS_URL` | Redis connection string | `redis://:password@redis:6379` |
| `CORS_ORIGIN` | Allowed CORS origin | `*` |
| `PAIRING_SETTLE_MS` | Arena pairing quiet window after newest queued player | `30000` |

## Dev vs Prod Mode

Switch between development and production with `APP_MODE`:

```bash
# .env
APP_MODE=dev    # React dev server with hot reload
APP_MODE=prod   # Nginx serving the built frontend
```

| | Dev | Prod |
|---|---|---|
| **Frontend Dockerfile** | `Dockerfile.dev` | `Dockerfile.prod` |
| **Nginx config** | `nginx.dev.conf` | `nginx.prod.conf` |
| **Hot reload** | yes | no |
| **Image size** | larger | smaller |

After changing `APP_MODE`, rebuild:

```bash
docker compose up -d --build
```

After changing only backend env vars such as `PAIRING_SETTLE_MS`, recreate the backend container:

```bash
docker compose up -d --force-recreate backend
```

## Testing, Validation, And Simulation Commands

Install dependencies before running local tests or simulations:

```bash
cd backend
npm ci
```

Backend validation:

```bash
# Full backend test suite
CORS_ORIGIN=http://localhost APP_MODE=test NODE_ENV=test npm test -- --runInBand

# Pairing-focused tests
npm test -- --runInBand pairingWorker.test.js

# Syntax-check simulation scripts
node --check test-scripts/simulateArenaPairings.js
node --check test-scripts/simulatePairingComparison.js
node --check test-scripts/simulatePairingPareto.js
```

Frontend validation:

```bash
cd ../view
npm ci
npm test -- --watchAll=false
npm run build
```

Docker/runtime validation:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f backend
```

Pairing simulations:

```bash
cd ../backend
npm run simulate:arena-pairings -- --players 20 --rounds 10 --seed 20260419
npm run simulate:pairing-comparison -- --players 20 --durationMinutes 60 --settleSeconds 30 --seed 20260519
npm run simulate:pairing-pareto
```

Reports are written to `backend/test-output/`. The Pareto report plots throughput, wait time, pool size, and problematic configurations for different player counts and settle windows.

## Running An OTB Arena Tournament

Short version:

1. Copy `.env.example` to `.env` and set production-safe secrets if needed.
2. Choose `APP_MODE`, `AUTH_ENABLED`, `CORS_ORIGIN`, and `PAIRING_SETTLE_MS`.
3. Start with `docker compose up -d --build`.
4. Create an Arena tournament from the admin UI.
5. Register/import players.
6. Start the tournament. This seeds Redis and starts the pairing worker.
7. Enter results as games finish; games can finish asynchronously.
8. Pause or withdraw players who leave early.
9. Monitor standings, live games, and backend logs.
10. Complete the tournament from the admin UI.

Detailed runbook: [Tournament Operations Guide](docs/tournament-operations.md#4-running-a-tournament).

## Project Structure

```text
ArenaManager/
├── assets/                  # Logos and static assets
├── backend/
│   ├── src/
│   │   ├── controllers/     # Route handlers
│   │   ├── middleware/      # Auth, validation
│   │   ├── models/          # Mongoose schemas
│   │   ├── routes/          # Express route definitions
│   │   ├── services/        # Business logic, pairing, ratings
│   │   ├── utils/           # Helpers
│   │   └── server.js        # Express app entry point
│   ├── test-scripts/        # Tournament/pairing simulations
│   ├── Dockerfile
│   └── package.json
├── view/                    # React frontend
├── nginx/                   # Dev/prod reverse proxy configs
├── scripts/                 # Operational scripts
├── docs/                    # Runbooks, API notes, diagrams
├── docker-compose.yml
└── .env.example
```

## Database Backup

Run a manual backup:

```bash
./scripts/backup-mongo.sh
```

## Security

See [SECURITY.md](SECURITY.md) for our security policy and vulnerability reporting guidelines.

Key security measures:

- JWT authentication with bcrypt password hashing.
- NoSQL injection prevention.
- Rate limiting on API endpoints.
- CORS origin restriction.
- Secrets configured through environment variables.

## Contributing

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/my-feature`.
3. Commit your changes: `git commit -m 'Add my feature'`.
4. Push to the branch: `git push origin feature/my-feature`.
5. Open a pull request.

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE). You are free to use, modify, and distribute this software under the terms of the GPL-3.0. Any derivative work must also be distributed under the same license.

---

<p align="center">
  Made by <strong>Skaki NTUA - Le Roi</strong>
</p>
