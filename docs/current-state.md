# Current state

Keep this page short: where we are, what's next, what's blocked. History goes in git and `decisions.md`.

## Where we are

| Step | Status |
|---|---|
| M1.1 Repo skeleton | Done: Nuxt 4, NuxtHub (SQLite), Drizzle, Valibot, Nuxt UI 4, ESLint feature boundaries, Vitest projects, CI check job, `.env.example` |
| M1.2 Agent docs and standards | Done: `AGENTS.md`, `CLAUDE.md`, `docs/` standards and server docs. No `reference/` pages yet (no shared helpers exist) |
| Owner answers | Q1 → D4 (English default), Q5 → D6 (shop `language` column); `@nuxt/a11y` added (D5); palette (D7); name "Laundry" and domains (D8); staging D1 created and staging build configured |
| M1.3 Server core | **Next** |

## Next step: M1.3 Server core

Errors + error handler, batch helpers, ids, validation, request id, origin check, rate limit, log, the SQLite test harness, `/api/health`. Each util gets tests and its `reference/` page in the same PR.

Things M1.3 settles:
- How errors reach the client in the spec's flat shape `{ code, message, fieldErrors? }` (spec §9) with Nitro's error handling. Record the choice in `decisions.md`.
- The rate-limit mechanism (Workers rate-limit bindings, as NUK) and which routes it covers.

## Not built yet (on purpose)

- **CI e2e job** (M1.6, with the e2e harness).
- **CI staging deploy** (M1.3, with `/api/health` for its smoke check). Needs the owner's GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` ([operations → Staging](server/operations.md#staging)).
- **Production environment:** D1 `laundry-production` and the `prod` block, when the first release is near.
- **Dependencies added in the step that uses them** (D2): grammY (M4), `libphonenumber-js` (M2.2), `uqr` (M3.1), `@nuxtjs/i18n` (M1.6), Better Auth (M1.4).

## Open questions

| # | Question | Who answers | Blocks |
|---|---|---|---|

## Owner notes

- **Khmer review:** the owner has someone to check Khmer text. Every PR that adds Khmer strings lists them for that review.
- **No pilot shop yet:** use mock data. `pnpm dev:accounts` and the staging sample data use two made-up shops with realistic prices, shaped like the paper tickets (spec §1).

## Blockers

None.
