# Documentation

What lives where, and how to read it.

## How to read these docs

- Start from the routing table in [`AGENTS.md`](../AGENTS.md). It names the sections a task needs.
- Search headings (`grep -n '^#' docs/...`) and read **one section**, not whole files. Follow a link only to resolve a dependency or a doubt; never read the tree recursively.
- A rule lives in one place. Other pages link to it instead of repeating it.

## Authority

1. The product spec, `laundry-portal-spec.md` (in the claude.ai project, not this repo).
2. [`decisions.md`](decisions.md): architecture choices made while building (D1, D2, …).
3. The standards below.

A conflict between them is recorded in [`current-state.md`](current-state.md) → Open questions. Never guess.

## Map

| Path | Holds |
|---|---|
| [`current-state.md`](current-state.md) | Where the project is, the next step, open questions, blockers. Short |
| [`plan.md`](plan.md) | **The work plan (D31):** the slip studio, the owner's portal, data, steps, open questions |
| [`decisions.md`](decisions.md) | Decisions: context, decision, alternatives, consequences |
| [`standards/ui.md`](standards/ui.md) | Visual rules: Nuxt UI first, tokens, type, touch, actions, status, accessibility, expected behavior |
| [`standards/page-patterns.md`](standards/page-patterns.md) | Resource index, settings, detail/editor, task flow, dashboard, page states |
| [`standards/responsive-layout.md`](standards/responsive-layout.md) | Compact-first layout for a phone at the counter, width classes, sticky bars |
| [`standards/ui-review-checklist.md`](standards/ui-review-checklist.md) | The checklist run before merging a UI change |
| [`standards/forms.md`](standards/forms.md) | Validation timing, the submit button, errors, unsaved changes, versions |
| [`standards/i18n.md`](standards/i18n.md) | English default + Khmer, string keys, Khmer type, money and date display, `*_km`/`*_en` data |
| [`standards/feature-standard.md`](standards/feature-standard.md) | Feature plan template and definition of done |
| [`server/architecture.md`](server/architecture.md) | Layers, routes, conventions, batch writes, versions, idempotency, errors, side effects, tests |
| [`server/repositories.md`](server/repositories.md) | Query rules, the tenant rule, guards, writes, D1 limits |
| [`server/security.md`](server/security.md) | Roles, statements, access helpers, sessions, passwords, request protection, route checklist |
| [`server/data-model.md`](server/data-model.md) | Every table and its lifecycle (spec §6, kept current) |
| [`server/operations.md`](server/operations.md) | Environments, secrets, migrations, deploys, scheduled jobs, Telegram setup |
| [`guides/development.md`](guides/development.md) | Commands, tests, checks before a PR |
| `reference/` | One page per shared helper (API, types, examples). Created in the **same PR** as the helper; examples must compile. [Index](reference/README.md) |

## Maintenance

- **Document only what exists.** A `reference/` page describes code that is in the repo. Standards may state a rule for code still to be built; mark it with the step that builds it ("(M1.3)").
- When a step changes a convention, update the owning page in the same PR.
- No history files. Decisions go in `decisions.md`; status goes in `current-state.md` and stays short.
- `AGENTS.md` stays under 8 KB.
