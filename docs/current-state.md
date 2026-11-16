# Current state

Keep this page short: where we are, what's next, what's blocked. History goes in git and `decisions.md`.

## Where we are

| Step | Status |
|---|---|
| M1.1 Repo skeleton | Done: Nuxt 4, NuxtHub (SQLite), Drizzle, Valibot, Nuxt UI 4, ESLint feature boundaries, Vitest projects, CI check job, `.env.example` |
| M1.2 Agent docs and standards | Done: `AGENTS.md`, `CLAUDE.md`, `docs/` standards and server docs. No `reference/` pages yet (no shared helpers exist) |
| Owner answers | Q1 → D4 (English default), Q5 → D6 (shop `language` column); `@nuxt/a11y` added (D5); palette (D7); name "Laundry" and domains (D8); staging D1 created and staging build configured |
| M1.3 Server core | Done: errors + `/api` error handler, validation and body limits, batch helpers, ids, log, request id, origin check, rate limits, Worker body cap, `/api/health`, API 404, SQLite test harness, CI staging deploy job. `reference/` pages for each |
| M1.4 Identity | Done: Better Auth (username, admin, organization, access control), permission map, access helpers, endpoint lockdown, `mustChangePassword`, session lifetimes and revocation, first-admin seed (task + SQL script), `/api/me`, `shop_settings`, migrations `0000`–`0001`. §17 items settled in D13–D18 |
| M1.5 Platform | **Next** |

## Next step: M1.5 Platform

Create shop + owner in one batch, suspend/resume, reset owner password, sign owner out everywhere, audit events (D12: `audit_events` arrives here). Two-shop isolation tests; super admin gets 403 on `/api/shop/**`.

## Not built yet (on purpose)

- **CI e2e job** (M1.6, with the e2e harness).
- **Production environment:** D1 `laundry-production` and the `prod` block, when the first release is near.
- **Dependencies added in the step that uses them** (D2): grammY (M4), `libphonenumber-js` (M2.2), `uqr` (M3.1), `@nuxtjs/i18n` (M1.6).

## Open questions

| # | Question | Who answers | Blocks |
|---|---|---|---|

## Owner notes

- **Khmer review:** the owner has someone to check Khmer text. Every PR that adds Khmer strings lists them for that review.
- **No pilot shop yet:** use mock data. `pnpm dev:accounts` and the staging sample data use two made-up shops with realistic prices, shaped like the paper tickets (spec §1).

## Blockers

- **Staging auth secret:** the staging Worker needs `NUXT_BETTER_AUTH_SECRET` as a Worker secret, set once by the owner ([operations → Staging](server/operations.md#staging)). Until then the smoke check's `/api/me` fails after deploy.
- **Staging platform admin:** after the secret, create the first admin with `pnpm admin:sql` + `wrangler d1 execute` ([operations → First platform admin](server/operations.md#first-platform-admin)).
