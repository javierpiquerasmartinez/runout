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
