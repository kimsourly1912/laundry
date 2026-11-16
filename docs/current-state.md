# Current state

Keep this page short: where we are, what's next, what's blocked. History goes in git and `decisions.md`.

## Where we are

| Step | Status |
|---|---|
| M1.1 Repo skeleton | Done: Nuxt 4, NuxtHub (SQLite), Drizzle, Valibot, Nuxt UI 4, ESLint feature boundaries, Vitest projects, CI check job, `.env.example` |
| M1.2 Agent docs and standards | Done: `AGENTS.md`, `CLAUDE.md`, `docs/` standards and server docs. No `reference/` pages yet (no shared helpers exist) |
| M1.3 Server core | **Next** |

## Next step: M1.3 Server core

Errors + error handler, batch helpers, ids, validation, request id, origin check, rate limit, log, the SQLite test harness, `/api/health`. Each util gets tests and its `reference/` page in the same PR.

Things M1.3 settles:
- How errors reach the client in the spec's flat shape `{ code, message, fieldErrors? }` (spec §9) with Nitro's error handling. Record the choice in `decisions.md`.
- The rate-limit mechanism (Workers rate-limit bindings, as NUK) and which routes it covers.

## Not built yet (on purpose)

- **CI e2e job** (M1.6, with the e2e harness) and **staging deploy** (once the staging D1 database exists).
- **`$env` staging/production blocks** in `nuxt.config.ts`: need the real D1 database ids.
- **Dependencies added in the step that uses them** (D2): grammY (M4), `libphonenumber-js` (M2.2), `uqr` (M3.1), `@nuxtjs/i18n` (M1.6), Better Auth (M1.4), wrangler (first deploy).

## Open questions

| # | Question | Who answers | Blocks |
|---|---|---|---|
| Q1 | For `*_km` / `*_en` data fields (price items, service types, policy text): is Khmer required and English optional (display falls back to Khmer)? Proposed in [i18n → Data in two languages](standards/i18n.md#5-data-in-two-languages) | Owner | M2.1 validation |
| Q2 | Laundry color palette (`app.config.ts`, one line) | Owner | Nothing (placeholder in use) |
| Q3 | Product name and domain | Owner | M1.4 site URL (placeholder until then) |
| Q4 | Pilot shop | Owner | M2.3 review |
| Q5 | Spec gap: §3 lists "language" as a shop setting, but §6 `shop_settings` has no column for it. Proposed: `language` (`km` default \| `en`), deciding customer-facing messages and the ticket page ([data-model](server/data-model.md#shop_settings-owner-shops)) | Owner (spec) | M1.5 table |

## Blockers

None.
