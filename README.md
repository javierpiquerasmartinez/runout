# Runout

Where a poker player keeps their own hands, sees their results and studies them: on their own, or replaying them in sync with others in a room. The product spec lives in [Functionality.md](Functionality.md) and the design in the [Runout design canvas](https://claude.ai/artifact/JLnkSLkt1GCzEd8sHvBspM), a Claude Design artifact whose boards are captures of the app as it works today.

## Structure

```
apps/
├── web/      Frontend · React + Vite
└── server/   Backend · Node + NestJS (HTTP + WebSocket)
packages/
└── poker/    @runout/poker · the hand evaluator both apps share
```

The two apps share one package and nothing else: `@runout/poker` holds the hold'em hand evaluator (best five-card hand, its category, comparable strength, card codes), so the server's All-in EV and the web's Lab never disagree on who wins a showdown (ADR 0007). It builds to `dist/` on `pnpm install` (its `prepare` script) and again at the start of each app's `build`, so a deploy whose install was skipped by a build cache still finds it; after changing it, run `pnpm --filter @runout/poker build`. Everything else, DTOs included, is defined once in each app.

## Getting started

Requirements: Node 24+ and pnpm 11.

```bash
pnpm install
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @runout/server db:local     # in its own terminal; see Database below
pnpm --filter @runout/server db:migrate
pnpm dev
```

- Web at http://localhost:5173
- API at http://localhost:3000/api (in development, Vite proxies `/api` and `/ws`)

The welcome screen at `/` creates a Room or joins one by Room Code; a Room lives at `/room/<code>`. Opening Runout issues no identity. Accounts are by Invitation only (ADR 0008): an Administrator sends one from `/admin`, and its link (`/invitation/<token>`) accepts it with `POST /api/invitations/<token>/password` (`{ password }`) or `/google` (`{ idToken }`). An existing Account signs in with Google (ADR 0005) — the web gets an ID token from Google Identity Services and posts it to `POST /api/sessions/google` with `{ idToken }` — or with `POST /api/sessions/password` and `{ email, password }`; either answers with a bearer token, and `DELETE /api/sessions/current` signs that browser out (for an Impersonation's Sign-in, it ends the Impersonation). A Google account with no Account and no Invitation is refused with `invitation-required`. `POST /api/password-resets` with `{ email }` emails a reset link, and `POST /api/password-resets/<token>` with `{ password }` sets the new one. Refusals may carry details beside the reason, such as `retryAt` on `too-many-attempts`. Joining a Room without an Account, `POST /api/rooms/<code>/guests` with `{ displayName }` issues an anonymous identity for that Room only: it stops authenticating when the Room closes, and its Screen Names, Preferences and Marks go with it. Signing in from inside the Room presents the anonymous token along with the ID token, and the Account takes its place (Master role included). Either token is kept in `localStorage` and sent as `Authorization: Bearer <token>` over HTTP and as `/ws?token=<token>` on the WebSocket. Creating a Room, and listing your open Rooms with `GET /api/rooms`, need an Account (`account-required` otherwise). Pasting Hand History text anywhere in a Room (outside a text field) imports it: `POST /api/rooms/<code>/hands` with `{ text }` reads every Hand in it (PokerStars' layout, which is also what PokerTracker 4 exports), appends them to the Queue and broadcasts `queue.entriesAdded` to every Participant; the reply lists what was discarded and why. Refused commands carry a typed reason: `{ "reason": … }` over HTTP, a `rejected` event with `{ command, reason }` over the WebSocket. The Master hands control on with `room.handOver` and `{ identityId }`, and after two minutes without the Master connected the role passes to the Participant present the longest; either way the Room gets a `room.masterChanged` event with `{ masterId, reason }` and Playback stays where it was.

A Room ends. `room.leave` takes a Guest out; the Master is refused with `master-must-choose` until they have handed the role over or closed the Room. `room.kick` with `{ identityId }` removes a Participant: the Room gets `room.participantKicked`, the kicked identity is out at once and is refused with `kicked-from-room` if it comes back, and its Queue Entries stay. `room.close` closes the Room for everyone: they all get `room.closed`, the Room Code stops working and the Room never reopens. A Room nobody is connected to for 30 minutes closes itself the same way. `GET /api/rooms` lists the open Rooms an identity is still a Participant of, the most recently joined first, each with whether anyone is in it right now — what the welcome screen shows under "Tus salas recientes".

Every change to a Room's shared state takes the next **revision** and is broadcast carrying it (`{ "event": …, "data": …, "revision": n }`); the snapshot says the revision it is at. A client applies changes in order, drops one it already has, and on a hole — or on reconnecting — throws away what it holds and asks for the Room afresh with `room.resync`, which answers with a whole `room.snapshot`. Every few seconds each client sends `room.heartbeat` with `{ sentAt, revision, latencyMs }` and is answered with `room.heartbeatAck` echoing `sentAt`, so it can time the round trip; from those heartbeats the server marks each Participant connected, unstable or away (over 30 s silent) and whether they have the current revision, and broadcasts `room.presence` whenever that picture changes. Presence carries no revision: each report replaces the last. The web client is a pure reducer (`roomClient.ts`) plus a connection manager (`roomConnection.ts`) that owns the socket, the heartbeats and reconnecting with a growing backoff; the sync indicator shows synced, recovering or offline with the latency, the table dims to 70% while recovering and freezes while offline, and after three failed reconnections a reload is offered.

A connection check lives at `/status`: it calls `GET /api/health` and pings the server over WebSocket at `/ws`, showing the latency. The health response also says whether the server can reach the database: `200` with `"database": "reachable"`, or `503` with `"status": "unavailable"` and `"database": "unreachable"`, so uptime checks and load balancers see the server as down.

## Signing in with Google

Both apps need the same OAuth client ID: `GOOGLE_CLIENT_ID` for the server, which refuses to start without it, and `VITE_GOOGLE_CLIENT_ID` for the web. Create a "Web application" OAuth client in the Google Cloud console (APIs & Services → Credentials) and add `http://localhost:5173` and the production frontend's origin to its authorised JavaScript origins. The e2e tests never call Google: `startApp()` injects a fake verifier (`test/support/google.ts`) that accepts made-up ID tokens.

## Environment

The server reads these from its environment (or `apps/server/.env` locally; see `.env.example`):

| Setting | Where | What it does |
| --- | --- | --- |
| `DATABASE_URL` | everywhere | The Postgres to use. Required. |
| `GOOGLE_CLIENT_ID` | everywhere | The OAuth client ID Google ID tokens must be issued for. Required unless `DEV_SIGN_IN` is on. |
| `FRONTEND_URL` | production | The web's origin, comma-separated for more than one. Allows CORS from it, and the first one is where the links in emails lead (`http://localhost:5173` when unset). Only production sets it. |
| `ADMINISTRATOR_EMAILS` | anywhere | The emails of the Administrators, comma-separated, matched ignoring case. Checked on every request, never stored: changing it and restarting takes effect without touching the database. Unset, nobody is one. |
| `RESEND_API_KEY` | production, both services | The [Resend](https://resend.com) API key Invitations, password resets and the email that ends a Bulk Import are sent with. With `FRONTEND_URL` set, each service refuses to start without it; the import service copies it, `EMAIL_FROM` and `FRONTEND_URL` from the API. |
| `EMAIL_FROM` | production | The sender, e.g. `Runout <hola@runout.app>`. It must be on a domain verified in Resend (Resend → Domains: add the domain and its DNS records). Required with `RESEND_API_KEY`. |
| `DEV_SIGN_IN` | local only | `true` turns on Test mode (below). Refused alongside `FRONTEND_URL`. |
| `IMPORT_SERVICE_ADDRESS` | production | Where the API reaches the import service, as `host:port` on a private network. With `FRONTEND_URL` set, the server refuses to start without it; unset elsewhere, nothing is woken. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | production, both services | The Cloudflare R2 bucket Bulk Imports' files are uploaded to, and an R2 API token able to read and write it. The import service refuses to start without them, and so does the API with `FRONTEND_URL` set; elsewhere, without them, Bulk Imports are refused with `bulk-import-unavailable`. |
| `IMPORT_SERVICE_SECRET` | both services | The secret the API's wakes carry. The import service refuses to start without it, and the API needs it alongside `IMPORT_SERVICE_ADDRESS`. |

Without `FRONTEND_URL`, as in local development, emails aren't sent: the server prints each one to its console, recipient, subject and link, so an Invitation or reset link can be followed without a real inbox. The e2e tests read them from a fake inbox instead (`test/support/inbox.ts`), and `startApp({ administratorEmails })` sets who the Administrators are.

### Test mode (local only)

To try pages behind an Account without signing in to Google, set `DEV_SIGN_IN=true` in `apps/server/.env` and `VITE_DEV_SIGN_IN=true` in `apps/web/.env.local`, then restart `pnpm dev`. A "Test mode" box shows under Google's button, with one button per test persona (Tester A and Tester B, two so a Room can have two people from two tabs). Each is a fixed Account (`dev-tester-a`, `dev-tester-b`) whose Library, Ranges and Preferences stay between visits, created without an Invitation as before: the one exception to invitation-only Accounts. To try the Administrator panel, add its email (`tester-a@dev.runout.test`) to `ADMINISTRATOR_EMAILS`. It goes through `POST /api/sessions/google` like Google does, with `dev-sign-in|<persona>` in place of the ID token; any other token still goes to Google, and with `DEV_SIGN_IN` on the server no longer needs `GOOGLE_CLIENT_ID`. Both flags are off unless set. The web draws the box only in the Vite dev server (`import.meta.env.DEV`), so a build never has it, and the server refuses to start with `DEV_SIGN_IN` set alongside `FRONTEND_URL`, which only production sets.

## Database

The server persists to Postgres through [Drizzle](https://orm.drizzle.team): Neon in production, any local Postgres in development. It connects to `DATABASE_URL`, read from the environment or from `apps/server/.env` (see `.env.example`).

- **Local Postgres.** `pnpm --filter @runout/server db:local` runs a Postgres that matches `.env.example` on port 5432, without Docker. It keeps its data in `apps/server/.data/postgres`; stop it with Ctrl+C. Any other Postgres works too: point `DATABASE_URL` at it.
- **Changing the schema.** Edit `apps/server/src/database/schema.ts`, then run `pnpm --filter @runout/server db:generate` to write a versioned SQL migration into `apps/server/drizzle/`. Review it and commit it with the schema change. Never edit a migration that has already been applied anywhere; write a new one.
- **Applying migrations.** `pnpm --filter @runout/server db:migrate` applies pending migrations to the database at `DATABASE_URL`. Run it locally after pulling. In production Render runs it before each deploy (see [Deploying](#deploying)), so it never needs running against Neon by hand.
- **Backfilling the Stats.** Migration `0027_hand_stats` keeps the Hero's Stats in each Hand, written at import; Hands stored before it have none, and count no opportunity in Estadísticas. After applying it, run `pnpm --filter @runout/server db:backfill-stats` once against the same `DATABASE_URL` to work them out from each Hand's stored content. It replaces a Hand's rows rather than adding to them, so it can run again safely, and says how many Hands it went through.
- **Reading stored Hands again.** A fix to a parser only reaches the Hands imported after it. To bring the Hands already stored up to date, run `pnpm --filter @runout/server db:reread-hands` against the `DATABASE_URL` after deploying the fix: it reads every Hand that keeps its Hand History again, as import does, and rewrites its content, the columns worked out from it (Result, All-in EV, Showdown, final pot, Rake, Rake Generated) and its Stat rows wherever they changed. Hands stored before their Hand History was kept (migration `0023_hand_history`) have no text to read and are left alone; import them again to fix them. It changes nothing when run again, and says how many Hands it read, rewrote, and left because their text no longer reads as the same Hand.

## Deploying

The web is on Vercel. The API and the import service are on Render, declared in the Blueprint [`render.yaml`](render.yaml): each a 0.5 CPU / 512 MB instance in Frankfurt, which does not spin down, deployed on every commit to `stage`.

- **The import service** (`runout-imports`) adds Bulk Imports to Libraries. It is the server's code from a second entry point, `src/import-service.main.ts` (`pnpm start:imports` built, `pnpm dev:imports` locally on port 3001), with no Rooms and none of the API's routes: its only route is `POST /wake`, which the API calls with `IMPORT_SERVICE_SECRET` when there may be work. It is a Render Private Service, with no public address, so that the API can reach it over the private network. Its secret is generated by Render, and the API takes that secret, the service's address and the import service its `DATABASE_URL` from each other in the Blueprint. While idle it runs no database query, so that Neon can suspend.
 It has no health check path on purpose: `/api/health` queries the database, and Render calling it every few seconds would keep Neon from suspending. Check it by hand after a deploy.

- **Migrations.** Render runs `pnpm run db:migrate` as the pre-deploy command, after the build and before the new version starts. If a migration fails the deploy fails, and the version already running keeps serving.
- **Bulk Imports' files.** The browser uploads them in parts straight to R2, with URLs the API presigns; the import service reads them back and deletes each one once its import completes. The four `R2_*` settings are set on the API in the panel, and the import service copies them from it. The bucket needs a CORS policy allowing `PUT` from the web's origin and exposing the `ETag` header, or the browser cannot tell the API which parts it uploaded. Choosing the same files again continues an interrupted upload; the API discards an upload not completed within 24 hours. Not covered by automated tests: after changing the bucket or its policy, upload a file over 20 MB from the Library's import dialog and check it reaches Importaciones.
- **Secrets.** The Blueprint names every environment variable with `sync: false` and no value; the values live only in Render's panel. Render asks for them when a Blueprint is first created and ignores them on later syncs, so a new secret is added to the service by hand in the panel, as well as to `render.yaml`.
- **How it was set up.** On 2026-11-13, in Render's panel: Blueprints → New Blueprint Instance, the `runout` repository, branch `stage`, the default `render.yaml`, keeping "Associate existing services". Render took on the existing `runout` service by its name, so its URL and its environment variables stayed as they were. Doing it again, for a new environment, would ask for every `sync: false` value.
- **Changing the services.** Edit `render.yaml` and merge it: the Blueprint syncs it to the services. A setting changed only in the panel is overwritten on the next sync, and one the file leaves out falls back to Render's default.

## Tests

- `pnpm test` runs the unit tests.
- `pnpm --filter @runout/server test:e2e` boots the real server against a real Postgres. Each run starts its own throwaway Postgres on a free port, applies every migration, and deletes it at the end, so it needs no database setup and never touches your local data. Use `startApp()` from `apps/server/test/support/app.ts` to boot the app in a test; it returns the app's `TestClock`, which you `advance()` to trigger time-based rules.
- `pnpm --filter @runout/web test:e2e` runs the browser tests in `apps/web/e2e` with [Playwright](https://playwright.dev) in Chromium, for what jsdom can't check because it lays nothing out. Today that is the replayer's layout: on a Library Hand and in a Room, at 1440×760, 1280×640, 1000×620, 1000×900 and 1920×1000, the page never scrolls, the transport bar stays on screen, and stepping through every Action of every seeded Hand no two pieces of the table (bets, board cards, the pot, the dealer button, seat plates, cards and statuses) overlap by more than 1 px. Playwright starts everything itself, on ports of its own so a running `pnpm dev` is left alone: the server, built and started by `pnpm --filter @runout/server e2e:stack` against a throwaway Postgres (deleted at the end) in Test mode, on port 3183; and Vite with `VITE_DEV_SIGN_IN` on, on http://127.0.0.1:5183. `e2e/seed.ts` signs in as Tester A, imports fixture Hand Histories into their Library and makes one Room per viewport before the tests run, and each test signs in through the Test mode button. The first time, install the browser with `pnpm --filter @runout/web exec playwright install chromium`. A failure names the Hand, the step and the overlapping pieces, and leaves a trace in `apps/web/test-results/` (`pnpm --filter @runout/web exec playwright show-trace <path>`).

The visual system (tokens, fonts, icon sprite and components from the "Sistema visual" boards of the design canvas) is on show at http://localhost:5173/design-system, in both languages and both themes.

## Web conventions

- **The [design canvas](https://claude.ai/artifact/JLnkSLkt1GCzEd8sHvBspM) wins** where it and an issue disagree (e.g. the sync button's brass focus ring, the field focus glow, the teal Showdown chip). It is the one source of truth for design: change the canvas first (it is edited from Claude Code with the Artifact tool), then the app. A new screen with no board follows the existing UI.
- **Tokens** live in `apps/web/src/styles/tokens.css`. Dark is the default; `data-theme="light"` on `<html>` switches to the light counterpart. Brass is the primary action, teal only sync and focus, red only all-in, error and delete.
- **Components** live in `apps/web/src/ui/`. A control that can't be used right now is locked, never hidden: pass `disabledReason` and it keeps its focus stop, draws a dashed border (the ghost button, as on the board, only dims) and adds the reason to its accessible name.
- **Icons** come from one sprite (`<IconSprite />`, mounted once) and are drawn with `<Icon name=… />`, coloured by `currentColor`.
- **No hard-coded UI strings.** Every string goes in `apps/web/src/i18n/messages/es.ts` (Spanish, the default and source catalogue) and `en.ts`; the type system rejects a missing key. Use `useI18n()` for `t`, `formatNumber` and `formatCurrency`, and set figures and codes with the `ro-mono` class.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Runs web and server in parallel |
| `pnpm build` | Builds the shared package, then both apps |
| `pnpm test` | Unit tests (Vitest) for both apps and the shared package |
| `pnpm lint` | Oxlint for both apps and the shared package |
| `pnpm --filter @runout/server test:e2e` | Backend end-to-end tests (HTTP + WS) |
| `pnpm --filter @runout/web test:e2e` | Browser tests (Playwright, Chromium): the replayer's layout |
