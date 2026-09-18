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
pnpm dev
```

- Web at http://localhost:5173
- API at http://localhost:3000/api (in development, Vite proxies `/api` and `/ws`)

The initial screen calls `GET /api/health` and pings the server over WebSocket at `/ws`, showing the latency.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Runs web and server in parallel |
| `pnpm build` | Builds both apps |
| `pnpm test` | Unit tests (Vitest) for both apps |
| `pnpm lint` | Oxlint for both apps |
| `pnpm --filter @runout/server test:e2e` | Backend end-to-end tests (HTTP + WS) |
