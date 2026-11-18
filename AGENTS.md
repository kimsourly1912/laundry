# Project instructions

Shared rules for Claude Code, Codex and other coding agents.

Laundry is a platform for small laundry shops in Cambodia: the shop's own paper slip on a phone, filled per order and sent to the customer as an image on Telegram. The platform designs slip templates in a Canva-like studio, creates each shop and its owner, and attaches templates to the shop; one user belongs to exactly one shop. One Nuxt 4 + Nitro app deployed as one Cloudflare Worker: NuxtHub (D1 in deployed environments, SQLite locally), Drizzle, Better Auth, Valibot, Nuxt UI 4 + Tailwind 4, `@nuxtjs/i18n`, resvg, pnpm, Vitest.

## Authority

The product spec (`laundry-portal-spec.md`, kept in the claude.ai project, not in this repo) > [`docs/decisions.md`](docs/decisions.md) > the standards in `docs/`. **D31 replaced the spec's flow and its step plan (§18): the work plan is [`docs/plan.md`](docs/plan.md).** A conflict found while working is recorded in `docs/current-state.md` → Open questions, never guessed.

## Core rules

- **Tenant isolation.** A Better Auth organization is a shop. Every shop-owned table has `shop_id`, and every query filters by it. The shop comes **from the session**, never from the client: shop APIs are `/api/shop/**` with no shop id or slug in the path or body. Another shop's record answers the same `404` as a missing one. Every new table or query gets a two-shop isolation test.
- **Permissions on the server, by statement.** Routes call exactly one access helper (`requireShopPermission`, `requirePlatformPermission`, `requireSignedIn`) with statements like `{ order: ['transition'] }`, never role names. Default deny. The UI hides actions from the statements in `/api/me`; the server always checks again.
- **The platform admin never reads shop data.** A super admin is never a shop member; `/api/shop/**` answers `403` to them.
- **Never trust the client** for user id, shop id, role, ownership, order numbers, dates or template versions. The server sets them and checks every slip value against the order's template version.
- **`version` on every edit.** An edit sends the version it read; stale → `409 VERSION_CONFLICT`.
- **One atomic batch per write.** D1 has no interactive transactions. Repositories return statements; the service runs them in one `db.batch` with guards, audit and idempotency rows.
- **Idempotency** (`Idempotency-Key` header) on order create and mark paid.
- **Never delete** orders (cancel instead), templates (archive instead), shops (suspend instead).
- **Thin routes:** access helper → validate (Valibot contract from `shared/contracts`) → one service call.
- **Feature boundaries.** Code lives in `app/features/<f>/` and `server/features/<f>/`. Other code reaches a feature only through its `index.ts`. Server imports use `#server/` and `#shared/`, never `../` across directories. ESLint enforces this.
- **English only** (D36). No hard-coded UI strings: every string is in `app/locales/en.json` (`@nuxtjs/i18n`, one locale). A shop that wants Khmer gets it on its slip artwork (D35).
- **Library APIs from the official docs for the installed version, never from memory.** Prefer what Nuxt, NuxtHub, Better Auth and Nuxt UI already provide before writing custom code or adding a dependency.
- **Simplest design with strong boundaries.** No abstraction for a problem that doesn't exist yet. Functions, not classes; more than two inputs → one options object, destructured in the body.

## Load context for the task

Classify the change **before editing**, then read only the sections below that apply. Search headings and read one section at a time; don't read the whole docs tree.

| Task | Read |
|---|---|
| Server route or service | [architecture](docs/server/architecture.md), [security → Route checklist](docs/server/security.md#route-checklist), affected tables in [data-model](docs/server/data-model.md) |
| SQL, repository, migration | [repositories](docs/server/repositories.md), [data-model](docs/server/data-model.md), [operations → Migrations](docs/server/operations.md#migrations) |
| Auth, sessions, permissions, tenancy | [security](docs/server/security.md) |
| UI (any screen, copy, buttons) | [ui](docs/standards/ui.md), [ui-review-checklist](docs/standards/ui-review-checklist.md); a new screen also [page-patterns](docs/standards/page-patterns.md) and [responsive-layout](docs/standards/responsive-layout.md) |
| Forms and validation | [forms](docs/standards/forms.md), [ui → Expected behavior](docs/standards/ui.md#11-expected-behavior) |
| Strings, language, money and date display | [i18n](docs/standards/i18n.md) |
| New feature or new screens | [feature-standard](docs/standards/feature-standard.md) and the routes above |
| Background jobs, Telegram, deploys, secrets | [operations](docs/server/operations.md) |
| Tests and checks | [development](docs/guides/development.md) |
| A shared helper's API | `docs/reference/` (one page per helper, added with the helper) |
| Resume work | [current-state](docs/current-state.md), then [plan → Steps](docs/plan.md#9-steps) |
| Documentation only | [docs index](docs/README.md) |

## Verification and completion

Use pnpm and Node 24. Before a PR: `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, and the e2e files you changed. Details: [development guide](docs/guides/development.md).

Definition of done for every step:
- The checks above pass. Report a check you couldn't run, and why.
- Every new table or query has a two-shop isolation test.
- Every new guard (permission, version, idempotency, tenant filter, state rule) is proven by removing it and seeing a test fail.
- Contracts are in `shared/contracts`; strings in `en.json`.
- Docs updated: the owning standard or `reference/` page (examples must compile), `data-model.md` for schema changes, `decisions.md` for an architecture choice, `current-state.md` for status.

PRs follow the groups in [plan → Steps](docs/plan.md#9-steps): **one PR per area, one commit per step** (owner's choice). Stop for review after each PR. Never merge, force-push or deploy without the owner asking. Keep this file under 8 KB: universal rules and routing only.
