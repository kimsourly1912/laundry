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
| M1.6 App shell | Done: data layer (`apiFetch`, `ApiError`, `useApiQuery`, `useMutation`, `usePaginatedQuery`), session and route access, auth/platform/shop layouts, sign-in, change password, account, English + Khmer (`@nuxtjs/i18n`, Noto Sans Khmer), platform screens (shops list, new shop, shop detail), e2e harness + CI job. D20, D21 |
| M2.1 Shop settings + pricing | Done: `/api/shop/settings` (currency locked once prices exist), service types and price items with archive (migration `0003`, composite FK, caps), settings and price list screens, money formatter + lint rule, unsaved-changes guard, the super admin's 403 over HTTP (e2e). D22 |
| M2.2 Customers | Done: `/api/shop/customers` (search by name or phone digits, pages), create, edit, anonymize; phones in E.164 (`libphonenumber-js`), one per shop by a partial unique index (migration `0004`); list and customer screens; shop route statements pinned to spec §9. D23 |
| M2.3 Orders | Done: `/api/shop/orders` (create with `Idempotency-Key`, list with status, payment, search and customer filters, detail, edit lines and note, start / ready / rework / collect / cancel, payment with `Idempotency-Key`), `/api/shop/today`; `order_counters`, `orders`, `order_lines`, `order_events`, `idempotency_keys` (migration `0005`), the daily key purge job; new-order flow with the customer picker, order list, order page, edit page, Today, a customer's orders, the bottom bar. D24 |
| New flow A: slip templates + shop setup | Done: `slip_templates` (migration `0006`), `/api/platform/templates`, template editor (item × service price grid), create shop from a template (a copy, in its currency), the platform keeps each shop's price list (`/api/platform/shops/:shopId/…`), owner reads prices only. D25, D26 |
| New flow B: the owner's two pages | Done: the paper-slip order form (phone optional, walk-ins), the orders board (Waiting / Ready / Done, one big button, paid and collected), More with contact support, shop screens at 640px; the wizard, order list and Today removed. D27 |
| New flow C: receipt to Telegram | **Next** |

## The new flow (D25), replacing spec §18 from here

The owner tested M2.3 and chose a simpler, managed flow: the platform sets each shop up from a slip template; the owner only takes orders. Plan, one PR each:

- **C. Receipt to Telegram:** the admin designs a receipt per template / shop (the slip's artwork as background + fields bound to order data), rendered to PNG on the server (resvg; Khmer checked), a QR on the staff screen to link Telegram, and status messages. Replaces M3.1–M4.3 as planned; printed QR slips later if shops want them.

## Not built yet (on purpose)

- **With their first user** (docs promise them; nothing needs them yet): overlay wrappers with Back-closes-overlay and the drawer wrapper (the first overlay holding input; edits are pages so far, D22), the viewport composable, axe checks in the e2e suite (M2), restoring an archived price entry, `runJob` (job runs recorded; the first job only logs, M4.2 brings the per-minute delivery job).
- **Pickup** (`/pickup`: scan or search → confirm → pay → collect, spec §8.4) comes with slip scanning (M3.2); until then the order page records payment and collects.
- **Khmer on a real low-end Android phone:** checked in Chromium only so far.
- **Production environment:** D1 `laundry-production` and the `prod` block, when the first release is near.
- **Dependencies added in the step that uses them** (D2): grammY (M4) `uqr` (M3.1).

## Open questions

| # | Question | Who answers | Blocks |
|---|---|---|---|
| Q7 | A paid order's lines are locked (D24): is "cancel and make a new order" acceptable at the counter, or are partial payments / top-ups needed? | Owner, with a real shop | Nothing now |
| Q8 | Rendering the receipt costs ~350 ms of CPU: is the Cloudflare account on Workers Paid (the free plan allows 10 ms)? | Owner | PR C |

## Owner notes

- **Contact support link:** set `NUXT_PUBLIC_SUPPORT_URL` (a Telegram chat link) as a Worker var on staging; until then the More page shows no support link.

- **PR size:** the owner prefers one PR for several small and medium steps (one commit each) over one PR per step (2026-11-16).
- **Khmer review:** the owner has someone to check Khmer text. Every PR that adds Khmer strings lists them for that review.
- **No pilot shop yet:** use mock data. `pnpm dev:accounts` and the staging sample data use two made-up shops with realistic prices, shaped like the paper tickets (spec §1).

## Blockers

None. Staging (`laundry-staging.angder.app`) is deployed with its auth secret and its first platform admin (`admin`, on a temporary password).
