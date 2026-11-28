# AGENTS.md

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Design

The design lives in the [Runout design canvas](https://claude.ai/artifact/JLnkSLkt1GCzEd8sHvBspM), a Claude Design artifact; there is no design file in the repo. Read and edit it with the Artifact tool (`project/canvas.json` is the index of boards). It wins over an issue's text where they disagree. Its last row, the original MVP spec, has not been brought up to date.

The canvas has three pages. **Design** holds every screen. **Architecture** holds the services, the server's modules and three flows, and is edited by hand in the canvas. **Data model** is generated from `apps/server/src/database/schema.ts`: after `pnpm build`, run `pnpm --filter @runout/server db:canvas -- --out <folder>`, then publish the `DataModel*.dc.html` files it writes (plus any new boards in `canvas.json`) to the canvas. It also rewrites `docs/canvas-sync.json`, and a server test fails when that stamp is behind the newest migration. A ticket that adds a migration, a service or a server module is not done until the matching page is up to date; Architecture boards say when they were last reviewed.
