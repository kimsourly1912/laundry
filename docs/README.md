# Documentation

What lives where, and how to read it.

## How to read these docs

- Start from the routing table in [`AGENTS.md`](../AGENTS.md). It names the sections a task needs.
- Search headings (`grep -n '^#' docs/...`) and read **one section**, not whole files. Follow a link only to resolve a dependency or a doubt; never read the tree recursively.
- A rule lives in one place. Other pages link to it instead of repeating it.

## Authority

The [paper slip plan](plan.md) defines the current product flow. [Decisions](decisions.md) record project history and the standards below cover implementation. Record conflicts in [Open questions](current-state.md#open-questions).

## Map

| Path | Holds |
|---|---|
| [`current-state.md`](current-state.md) | Where the project is, the next step, open questions, blockers. Short |
| [`plan.md`](plan.md) | The current slip and Telegram flow, platform setup, scope and verification |
| [`city-laundry-pilot-plan.md`](city-laundry-pilot-plan.md) | Paper-slip pilot handoff covering Studio field placement, shop assignment, and counter intake |
| [`studio-behaviour.md`](studio-behaviour.md) | **Studio behaviour spec (draft):** every canvas tool's rules and edge cases, with sources, for the studio rebuild |
| [`decisions.md`](decisions.md) | Decisions: context, decision, alternatives, consequences |
| [`standards/ui.md`](standards/ui.md) | Visual rules: Nuxt UI first, tokens, type, touch, actions, status, accessibility, expected behavior |
| [`standards/page-patterns.md`](standards/page-patterns.md) | Resource index, settings, detail/editor, task flow, dashboard, page states |
| [`standards/responsive-layout.md`](standards/responsive-layout.md) | Compact-first layout for a phone at the counter, width classes, sticky bars |
| [`standards/ui-review-checklist.md`](standards/ui-review-checklist.md) | The checklist run before merging a UI change |
| [`standards/forms.md`](standards/forms.md) | Validation timing, the submit button, errors, unsaved changes, versions |
| [`standards/i18n.md`](standards/i18n.md) | English UI, Khmer slip labels, money and date display |
| [`html-template-studio-plan.md`](html-template-studio-plan.md) | HTML editor, slip bindings and AI import contract |
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
