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
| M1.5 Platform | Done: `/api/platform/shops` (list, create shop + owner in one batch, detail, rename, suspend, resume, owner reset-password, owner revoke-sessions), `audit_events` (migration `0002`), shared list and validation building blocks. D19 |
| M1.6 App shell | **Next** |

## Next step: M1.6 App shell

Layouts (auth, platform, shop), sign-in, change password, account page, i18n km/en (`@nuxtjs/i18n`), `useApiQuery`, `useMutation`, `usePaginatedQuery`, `apiFetch`, errors, and their `reference/` docs. E2E: sign in → forced change → shop home; platform admin → shops list; revoked session → sign-in. Adds the CI e2e job.

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

None. Staging (`laundry-staging.angder.app`) is deployed with its auth secret and its first platform admin (`admin`, on a temporary password).
