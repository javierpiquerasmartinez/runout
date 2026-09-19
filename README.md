# Runout

A web room where a group of poker players review the same hand together, synced in real time. The product spec lives in [Functionality.md](Functionality.md) and the design in [Design.html](Design.html).

## Structure

```
apps/
├── web/      Frontend · React + Vite
└── server/   Backend · Node + NestJS (HTTP + WebSocket)
```

The two apps are isolated: they share no code and no dependencies. The monorepo only orchestrates them through pnpm workspaces.

## Getting started

Requirements: Node 24+ and pnpm 11.

```bash
pnpm install
cp apps/server/.env.example apps/server/.env
pnpm --filter @runout/server db:local     # in its own terminal; see Database below
pnpm --filter @runout/server db:migrate
pnpm dev
```

- Web at http://localhost:5173
- API at http://localhost:3000/api (in development, Vite proxies `/api` and `/ws`)

The initial screen calls `GET /api/health` and pings the server over WebSocket at `/ws`, showing the latency. The health response also says whether the server can reach the database: `200` with `"database": "reachable"`, or `503` with `"status": "unavailable"` and `"database": "unreachable"`, so uptime checks and load balancers see the server as down.

## Database

The server persists to Postgres through [Drizzle](https://orm.drizzle.team): Neon in production, any local Postgres in development. It connects to `DATABASE_URL`, read from the environment or from `apps/server/.env` (see `.env.example`).

- **Local Postgres.** `pnpm --filter @runout/server db:local` runs a Postgres that matches `.env.example` on port 5432, without Docker. It keeps its data in `apps/server/.data/postgres`; stop it with Ctrl+C. Any other Postgres works too: point `DATABASE_URL` at it.
- **Changing the schema.** Edit `apps/server/src/database/schema.ts`, then run `pnpm --filter @runout/server db:generate` to write a versioned SQL migration into `apps/server/drizzle/`. Review it and commit it with the schema change. Never edit a migration that has already been applied anywhere; write a new one.
- **Applying migrations.** `pnpm --filter @runout/server db:migrate` applies pending migrations to the database at `DATABASE_URL`. Run it locally after pulling, and against Neon (with Neon's `DATABASE_URL`, `sslmode=require`) before deploying a server that needs the new schema.

## Tests

- `pnpm test` runs the unit tests.
- `pnpm --filter @runout/server test:e2e` boots the real server against a real Postgres. Each run starts its own throwaway Postgres on a free port, applies every migration, and deletes it at the end, so it needs no database setup and never touches your local data. Use `startApp()` from `apps/server/test/support/app.ts` to boot the app in a test; it returns the app's `TestClock`, which you `advance()` to trigger time-based rules.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Runs web and server in parallel |
| `pnpm build` | Builds both apps |
| `pnpm test` | Unit tests (Vitest) for both apps |
| `pnpm lint` | Oxlint for both apps |
| `pnpm --filter @runout/server test:e2e` | Backend end-to-end tests (HTTP + WS) |
