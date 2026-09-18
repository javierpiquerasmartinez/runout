# 0001 · Initial stack: monorepo with two isolated apps

Date: 2026-09-18 · Status: accepted

## Context

Runout needs a rich frontend (the table, the queue, the player) and a backend that holds each room's state and broadcasts it in real time with under 300 ms of latency (E5).

## Decision

- Monorepo with **pnpm workspaces**, no extra orchestration tool for now.
- `apps/web`: **React + Vite** (SPA; no need for SEO or SSR). The reference design is already built in React.
- `apps/server`: **Node + NestJS** with `@nestjs/platform-ws` (native WebSocket, no Socket.IO). HTTP prefix `/api`, WebSocket at `/ws`.
- The two apps are **isolated**: they share no packages or code.
- Tests with **Vitest** and linting with **Oxlint** in both (what the official scaffolds ship with).
- **No database or authentication** for now. When persistence is needed it will be **Postgres (Neon) + Drizzle**.

## Consequences

- WebSocket messages and DTOs are defined twice, once in each app. If the hand-history parser (E2) or the table-state computation has to run on both sides, we will need to reconsider whether a shared package is worth it.
- In development the backend port is pinned to 3000 in the `dev` script, because some launchers inject `PORT` and it would collide with Vite. In production `PORT` is respected.
