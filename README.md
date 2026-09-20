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

The welcome screen at `/` creates a Room or joins one by Room Code; a Room lives at `/room/<code>`. The first visit issues an anonymous identity (ADR 0003): its token is kept in `localStorage` and sent as `Authorization: Bearer <token>` over HTTP and as `/ws?token=<token>` on the WebSocket. Pasting Hand History text anywhere in a Room (outside a text field) imports it: `POST /api/rooms/<code>/hands` with `{ text }` reads every Hand in it (PokerStars' layout, which is also what PokerTracker 4 exports), appends them to the Queue and broadcasts `queue.entriesAdded` to every Participant; the reply lists what was discarded and why. Refused commands carry a typed reason: `{ "reason": … }` over HTTP, a `rejected` event with `{ command, reason }` over the WebSocket. The Master hands control on with `room.handOver` and `{ identityId }`, and after two minutes without the Master connected the role passes to the Participant present the longest; either way the Room gets a `room.masterChanged` event with `{ masterId, reason }` and Playback stays where it was.

A connection check lives at `/status`: it calls `GET /api/health` and pings the server over WebSocket at `/ws`, showing the latency. The health response also says whether the server can reach the database: `200` with `"database": "reachable"`, or `503` with `"status": "unavailable"` and `"database": "unreachable"`, so uptime checks and load balancers see the server as down.

## Database

The server persists to Postgres through [Drizzle](https://orm.drizzle.team): Neon in production, any local Postgres in development. It connects to `DATABASE_URL`, read from the environment or from `apps/server/.env` (see `.env.example`).

- **Local Postgres.** `pnpm --filter @runout/server db:local` runs a Postgres that matches `.env.example` on port 5432, without Docker. It keeps its data in `apps/server/.data/postgres`; stop it with Ctrl+C. Any other Postgres works too: point `DATABASE_URL` at it.
- **Changing the schema.** Edit `apps/server/src/database/schema.ts`, then run `pnpm --filter @runout/server db:generate` to write a versioned SQL migration into `apps/server/drizzle/`. Review it and commit it with the schema change. Never edit a migration that has already been applied anywhere; write a new one.
- **Applying migrations.** `pnpm --filter @runout/server db:migrate` applies pending migrations to the database at `DATABASE_URL`. Run it locally after pulling, and against Neon (with Neon's `DATABASE_URL`, `sslmode=require`) before deploying a server that needs the new schema.

## Tests

- `pnpm test` runs the unit tests.
- `pnpm --filter @runout/server test:e2e` boots the real server against a real Postgres. Each run starts its own throwaway Postgres on a free port, applies every migration, and deletes it at the end, so it needs no database setup and never touches your local data. Use `startApp()` from `apps/server/test/support/app.ts` to boot the app in a test; it returns the app's `TestClock`, which you `advance()` to trigger time-based rules.

The visual system (tokens, fonts, icon sprite and components from the design-system boards of Design.html) is on show at http://localhost:5173/design-system, in both languages and both themes.

## Web conventions

- **Design.html wins** where it and an issue disagree (e.g. the sync button's brass focus ring, the field focus glow, the teal Showdown chip).
- **Tokens** live in `apps/web/src/styles/tokens.css`. Dark is the default; `data-theme="light"` on `<html>` switches to the light counterpart. Brass is the primary action, teal only sync and focus, red only all-in, error and delete.
- **Components** live in `apps/web/src/ui/`. A control that can't be used right now is locked, never hidden: pass `disabledReason` and it keeps its focus stop, draws a dashed border (the ghost button, as on the board, only dims) and adds the reason to its accessible name.
- **Icons** come from one sprite (`<IconSprite />`, mounted once) and are drawn with `<Icon name=… />`, coloured by `currentColor`.
- **No hard-coded UI strings.** Every string goes in `apps/web/src/i18n/messages/es.ts` (Spanish, the default and source catalogue) and `en.ts`; the type system rejects a missing key. Use `useI18n()` for `t`, `formatNumber` and `formatCurrency`, and set figures and codes with the `ro-mono` class.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Runs web and server in parallel |
| `pnpm build` | Builds both apps |
| `pnpm test` | Unit tests (Vitest) for both apps |
| `pnpm lint` | Oxlint for both apps |
| `pnpm --filter @runout/server test:e2e` | Backend end-to-end tests (HTTP + WS) |
