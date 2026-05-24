---
name: agentport-persona-curator
description: Refresh agentport built-in role personas with researched skills, agents, commands, and MCP recommendations. Use when updating persona JSON manifests, adding new personas, auditing persona recommendation sources, polishing the Personas UI, taking screenshots, or preparing GitHub issues/PRs for periodic persona curation.
---

# Agentport Persona Curator

## Overview

Use this skill to periodically refresh `agentport` personas from web research, update local persona manifests, verify the Personas UI, and publish the work through an issue or PR.

## Workflow

1. Inspect the repo state:
   - Run `git status --short`, `git branch --show-current`, and confirm the target branch.
   - Read `personas/*.json`, `src/personas/*`, `src/web/public/app.js`, `src/web/public/styles.css`, and `tests/smoke/N-personas.test.ts` as needed.
   - Do not overwrite unrelated local changes.

2. Research current recommendations:
   - Search the web for each role being updated.
   - Prefer directories and known recommendation sources in `references/research-sources.md`.
   - Use current, specific source URLs. For fast-moving tool recommendations, browse rather than relying on memory.
   - Treat search results as inputs for maintainer-curated data, not as authoritative copy-paste lists.

3. Curate persona data:
   - Keep each persona at 16 total recommendations or fewer across `skills`, `agents`, `commands`, and `mcp`.
   - Preserve the existing manifest shape:
     - `id`
     - `name`
     - `description`
     - `version`
     - `recommendations`
   - Require every recommendation to include:
     - `id`
     - `rationale`
     - `source`
   - Use `install` specs only when the MCP package/command is reasonably clear.
   - If a recommended MCP needs secrets, add `env` with environment variable names, not literal secrets.
   - Avoid duplicate recommendations inside the same persona unless there is a strong cross-category reason.

4. Update implementation and tests:
   - Edit persona manifests in `personas/`.
   - Add new persona IDs to `tests/smoke/N-personas.test.ts`.
   - Ensure tests assert that recommendations have `rationale`, `source`, and a maximum count of 16.
   - If the UI issue is part of the task, keep styling scoped to the Personas view.

5. Validate:
   - Run:
     ```bash
     npm test -- --run tests/smoke/N-personas.test.ts
     npm run build
     ```
   - If UI changed, run the web app, open the Personas tab, inspect list and detail views, and take screenshots.
   - If port `3737` is busy, use another port with `PORT=<port> npm run web`.

6. Publish or prepare GitHub work:
   - If asked to create an issue, include summary, scope, acceptance criteria, verification, research sources, and screenshots.
   - If asked to create a PR, include summary, verification commands, screenshots, and related issue links.
   - If a GitHub connector lacks write permission, use the authenticated `gh` CLI as fallback.

## Persona Curation Rules

- Keep role bundles practical for onboarding: a persona should feel like a starter kit, not a catalog dump.
- Prefer tools that are role-relevant and currently findable from public sources.
- Prefer stable IDs that read like package or skill IDs: lowercase, hyphenated, concise.
- Use `source` for the page that justifies the recommendation. It can be a directory page, a specific skill listing, an MCP guide, or a credible community recommendation.
- Write `rationale` in one sentence explaining why the role benefits from the item.
- For MCP recommendations:
  - Include `transport` when known.
  - Include `install.command` and `install.args` when command-line installation is clear.
  - Leave out `install` if installation requires account-specific setup or cannot be confirmed.

## UI Checkpoints

When touching Personas UI:

- Verify the Personas tab lists all expected persona cards.
- Verify detail view groups items by type and shows installed counts.
- Verify the `All personas` back control looks native to the app, not like an unstyled browser button.
- Capture at least:
  - Persona grid screenshot.
  - Persona detail screenshot.
- Store screenshots under `docs/screenshots/` when they need to be linked from GitHub.

## Suggested Issue Shape

Use this structure when filing a recurring update issue:

```markdown
## Summary

Refresh built-in Personas with current curated recommendations and verify the UI.

## Scope

- Roles updated:
- New roles:
- UI fixes:
- Data quality constraints:

## Screenshots

![Persona grid](...)
![Persona detail](...)

## Research Sources

- ...

## Acceptance Criteria

- [ ] Every recommendation has `rationale` and `source`.
- [ ] No persona has more than 16 recommendations.
- [ ] Persona grid and detail screenshots are attached.
- [ ] Smoke tests and build pass.
```

