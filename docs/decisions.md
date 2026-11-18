# Decisions

Architecture choices made while building. Each one: **Context → Decision → Alternatives → Consequences**. The product spec's own decisions (P1–P13, T1–T16) are not repeated here; this file records choices the spec leaves open and any change to them.

Add a decision when a choice has real alternatives or tradeoffs. Don't add one for a trivial implementation detail. Number them in order; never reuse a number. A decision that changes an earlier one says so, and the earlier one gets a "Replaced by Dn" line.

---

## D1. Standards adopted from NUK Cafe Admin, adapted

**Context.** The spec names `kimsourly1912/nuk-cafe-admin` (NUK) as the reference implementation. NUK's conventions work in production on the same stack (Nuxt 4, NuxtHub, D1, Drizzle, Better Auth, Nuxt UI). Its documentation is large (hundreds of KB, cafe-specific, with long decision history).

**Decision.** Copy NUK's conventions, rewritten for laundry and kept short:
- Setup from NUK (M1.1): `nuxt.config.ts` structure, ESLint feature-boundary rules, Vitest projects, the CI check job.
- Standards from NUK (M1.2): UI, page patterns, responsive layout, review checklist, forms, feature standard, server architecture, repositories, security, operations. Plus a new i18n standard (Khmer default).
- Stripped: NUK decision ids, owner/date stamps, cafe-only sections (menu editor, 3D studio, KHQR, Google sign-in, 2FA, branches, multi-cafe paths).
- Reference pages (`docs/reference/`) come over only with the helper they describe.

**Alternatives.** (a) Write standards from scratch: loses rules NUK learned the hard way. (b) Copy NUK docs as they are: too large for agents to load, full of cafe rules that don't apply.

**Consequences.** When a standard is unclear, NUK's matching page is the reference (spec §10). A NUK rule that conflicts with the spec loses to the spec.

## D2. Dependency versions and timing

**Context.** Spec T1 says versions are copied from NUK's `package.json` at M1.1. The repo's starter already had newer patch releases of the same packages (`nuxt` ^4.6.4 vs ^4.6.2, `@nuxthub/core` 0.10.12 vs 0.10.8, `@nuxt/test-utils` 4.4.0 vs 4.3.2).

**Decision.**
- Keep the starter's newer patch versions of the same major/minor lines. Use NUK's ranges for packages the starter didn't have (`valibot`, `vue-tsc`, `@iconify-json/lucide`).
- Add each remaining dependency in the step that first uses it (see [current-state → Not built yet](current-state.md#not-built-yet-on-purpose)), checking its current docs then.
- Keep NUK's `tinypool` override in `pnpm-workspace.yaml`: the same critical advisories appear through `oxfmt` (lint only).

**Alternatives.** Downgrade to NUK's exact versions: older patches, no benefit. Install everything now: unused packages to audit and update before they do anything.

**Consequences.** `pnpm audit --audit-level high` passes. Each later step owns its dependency's version check.

## D3. Better Auth arrives in M1.4, not M1.1

**Context.** The starter included `@nuxtjs/better-auth` with email + password and a generated migration (`user`, `session`, `account`, `verification`). M1.1 says "no auth". M1.4 adds the username, admin and organization plugins, which change those tables.

**Decision.** Remove the module, its config files and the starter migration in M1.1. M1.4 adds Better Auth with its final plugin set and generates the first auth migration.

**Alternatives.** Keep the starter's module and migration: ships a migration that M1.4 must replace, and an email sign-in the product doesn't use (P4).

**Consequences.** The first migration in `server/db/migrations` comes from M1.3 or M1.4. Nothing is deployed yet, so nothing needs migrating.

## D4. English is the default language

**Context.** Spec P12 made Khmer the default, with English second. The owner decided (answer to Q1, 2026-11-16) that English is the default.

**Decision.**
- The default locale is `en`; `km` is the second locale and stays complete (every key in both files). `<html lang>` starts as `en`.
- Two-language shop data: `*_en` required, `*_km` optional; display falls back to English.
- A shop's customer-facing `language` (D6) defaults to `en`.

**Alternatives.** Khmer default (spec P12): closer to what shop owners and customers read first, but not the owner's choice.

**Consequences.** Replaces the default in spec P12; the spec should be updated to match. A Khmer-reading owner switches once and the choice is remembered. Khmer type rules (font, line height) still apply to every screen.

## D5. `@nuxt/a11y` in development

**Context.** The owner asked for the [`@nuxt/a11y`](https://github.com/nuxt/a11y) module. The published version is `1.0.0-alpha.1`. In that version the module is enabled only in the dev server (`enabled` defaults to `nuxt.options.dev`); its README describes a build-time report that this version doesn't ship yet.

**Decision.** Install it as a dev dependency, pinned exactly (`1.0.0-alpha.1`, as an alpha can change between versions). Run axe-core against WCAG 2.0–2.2 A/AA tags, matching our accessibility baseline. Checked: a production build contains no axe code.

**Alternatives.** Only the e2e axe checks planned for M1.6: later feedback, no in-browser highlighting while building.

**Consequences.** Accessibility feedback while developing. It doesn't replace the e2e accessibility tests. On upgrade, read the changelog: the build-time report (`report.failOnViolation`, on by default per the README) could start failing builds.

## D6. Shop language column

**Context.** Spec §3 lists "language" as a shop setting; spec §6's `shop_settings` has no column for it. The owner accepted the proposal (answer to Q5, 2026-11-16).

**Decision.** `shop_settings.language`: `en` (default, D4) | `km`, with a `CHECK`. It decides the language of that shop's customer-facing output: Telegram messages and the public ticket page. Each user's app language is their own choice, separate from this.

**Alternatives.** Use each customer's Telegram language: unreliable and not available on the ticket page.

**Consequences.** Spec §6 should add the column. Built with `shop_settings` in M1.5.

## D7. Palette: sky and slate

**Context.** Spec "Values to fill in" left the palette open. The owner accepted the recommendation (2026-11-16).

**Decision.** `primary: 'sky'`, `neutral: 'slate'` in `app/app.config.ts` (already the placeholder).

**Alternatives.** Teal + slate: also calm and clean; no strong reason over sky.

**Consequences.** M1.6 measures contrast in light and dark mode; light-mode text shades that fail 4.5:1 get a darker `--ui-<color>` in `tailwind.css` ([ui §2](standards/ui.md#2-color-tokens)).

## D8. Product name and domains

**Context.** Spec "Values to fill in": product name and domain. The owner chose the name **Laundry** and a subdomain of their existing `angder.app` (2026-11-16), in the same Cloudflare account as NUK.

**Decision.**
- Production: `laundry.angder.app`. Staging: `laundry-staging.angder.app`.
- Each is a Worker custom domain, created by `wrangler deploy`; `workers_dev` and preview URLs off.
- Staging D1 `laundry-staging` created in APAC (near Cambodia).

**Alternatives.** `staging.laundry.angder.app`: a second-level subdomain, which Cloudflare's free Universal SSL certificate (`*.angder.app`) doesn't cover; it would need an advanced certificate. `laundry-staging` stays one level deep.

**Consequences.** `NUXT_PUBLIC_SITE_URL` per environment is set in its `$env` block as a public var. Laundry shares the account with NUK: every laundry resource is named `laundry-*`, and the CI token should be scoped to what laundry deploys.

## D9. Flat error body

**Context.** Spec §9 says errors are `{ code, message, fieldErrors? }`. NUK sends h3's shape (`{ statusCode, message, data: { code, … } }`). Spec §12 asks for the request id in logs; a user's screenshot should lead to them.

**Decision.**
- `/api/**` errors answer with the flat body `{ code, message, fieldErrors?, requestId }`, written by our Nitro error handler (`server/error-handler.ts`), registered before Nuxt's.
- 5xx bodies are fixed (`INTERNAL`); a library's own 4xx text is replaced by a generic message.
- **Messages are English.** The app shows its own translated text for each `code` (km/en) and falls back to the server's message. The server never translates.

**Alternatives.** h3's nested shape: what `createError` gives for free, but not the spec's contract, and every client reads `data.code`. Server-side translation: the server would need each request's language, and the app already owns its strings.

**Consequences.** `ofetch` exposes the body as `error.data`, so the app reads `error.data.code` either way. Field errors from server validation are English fallbacks; forms validate on the client first, in the user's language.

## D10. Rate limits

**Context.** Spec §12 asks for rate limits on sign-in, the public ticket lookup and the webhook. NUK uses Cloudflare's Workers rate-limit bindings: no extra service, counted per address at the edge.

**Decision.**
- Workers rate-limit bindings, keyed on `cf-connecting-ip`: `RATE_LIMIT_PUBLIC` (`/api/public/**`, 300/min) and `RATE_LIMIT_WEBHOOK` (`/api/webhooks/**`, 600/min). Namespace ids `3001`/`3002` on staging (`4001`… for production), apart from NUK's in the same account.
- Generous numbers: Cambodian mobile carriers put many customers behind one address. The ticket token's 128 bits, not the limit, stop guessing.
- Sign-in is limited by Better Auth's own rate limiter (M1.4). `/api/health` is never limited.

**Alternatives.** A counter table in D1: a write per request. Cloudflare WAF rules: zone configuration outside the repo, coarser.

**Consequences.** Nothing is limited in dev, tests or the Node build (no binding). Cloudflare counts per location and lets a few requests past: a bound on abuse, not a quota.

## D11. Worker body cap

**Context.** Nitro 2's Cloudflare entry reads the whole request body into memory before any route runs, so `readValidBody`'s 64 KB limit comes too late to protect the Worker's memory. NUK found this and wraps the entry.

**Decision.** `server/cloudflare-entry.ts` wraps Nitro's Cloudflare entry (wired in `nuxt.config.ts` → `nitro:init`, Cloudflare builds only). It counts `/api/**` body bytes as they arrive and answers `413` past 64 KB; otherwise it passes the already-read body on. Routes still check again.

**Alternatives.** Trust `Content-Length`: a chunked body has none. No cap: a large body costs memory on every request that sends one.

**Consequences.** One cap for every API route today; a future upload route adds its own limit in `workerBodyLimit`. Checked under workerd (`wrangler dev`) with and without `Content-Length`.

## D12. Tables arrive with their first user

**Context.** The spec places `audit_events` and `idempotency_keys` in the `platform` feature. M1.3 builds the server core, which has no write yet that needs them.

**Decision.** `audit_events` lands with the first privileged write (M1.5, platform creates a shop); `idempotency_keys` with the first idempotent action (M2.3, order create). Each comes with its helpers, tests and `reference/` page then.

**Alternatives.** Create both now: tables and helpers without a caller, documented before they're used.

**Consequences.** The first migration comes with Better Auth in M1.4.

## D13. Better Auth endpoint lockdown

**Context.** Spec §5: Better Auth's organization, member, invitation and access-control endpoints are blocked for everyone with `403`; shops and owners are made only through `/api/platform/**`. Better Auth mounts every plugin's endpoints, including the admin plugin's (create user, set role, impersonate) and account updates. NUK closes them with an allowlist answering 404.

**Decision.** An **allowlist** of the endpoints the app uses (`get-session`, `sign-in/username`, `sign-out`, `change-password`, `list-sessions`, `revoke-other-sessions`); every other `/api/auth/*` request answers **`403 FORBIDDEN`** in our error format (spec's status). Server code calls `auth.api.*` directly and isn't affected. Platform roles: `user` (everyone; the spec's "empty" role) and `superadmin`; neither is granted any of Better Auth's own admin or organization statements.

**Alternatives.** A blocklist of the spec's four groups: leaves sign-up, email sign-in, the admin plugin and any endpoint a later version adds open. NUK's 404: the spec asks for 403.

**Consequences.** A new page needing an endpoint adds it to `AUTH_HTTP_ENDPOINTS` after reading that endpoint's checks in the installed version. Sign-up is also disabled in the config.

## D14. Session lifetimes

**Context.** Spec T16: owners 30 days sliding, no cap; super admins 12 h idle, 7-day cap. §17 asked whether Better Auth's global `expiresIn` allows per-role lifetimes and an absolute cap, and whether renewal issues a new cookie value. Read in better-auth 1.7.25 (`api/routes/session.mjs`): a session is renewed when `expiresAt − expiresIn + updateAge ≤ now`, by `internalAdapter.updateSession`, which runs the `session.update` database hooks with the request's current session in `ctx.context.session`.

**Decision.**
- Owners: Better Auth's own `expiresIn` 30 days, `updateAge` 1 day.
- Super admins: the `session.create` and `session.update` hooks set `expiresAt` to `min(now + 12 h, createdAt + 7 days)`. A super admin's session is then always due for renewal, so every use moves it (one write per platform request, acceptable for one or two admins), never past the cap. Better Auth refuses the expired session itself, on every route, `/api/auth/get-session` included.
- **Renewal keeps the token:** the same session row and cookie value, a new `expiresAt` and cookie `Max-Age` (checked in a test).

**Alternatives.** The spec's fallback: our own idle and cap checks in `requirePlatformPermission`. They would leave Better Auth's session alive elsewhere (the app would see a session the platform API refuses), and need a `lastSeenAt` write of our own, since `updatedAt` only moves once a day.

**Consequences.** Depends on Better Auth passing the current session to the update hook; the faked-time tests (`identity.auth.test.ts`) fail if an upgrade changes that. No cookie cache is configured: with one, renewal could be skipped.

## D15. Accounts: username and a placeholder email

**Context.** Spec P4: owners sign in with username + password, no email. §17: Better Auth's `user.email` is required. Phone keyboards capitalize and add spaces.

**Decision.** Every user gets `email = <userId>@users.invalid` (RFC 2606 reserved domain): unique, never shown, never mailed (nothing sends email). Usernames are trimmed and lowercased (`normalizeUsername`), at creation and **at sign-in** (a `before` hook rewrites the body, because Better Auth validates the characters before its own normalization).

**Alternatives.** A fake real-looking domain: could someday receive mail. Leaving sign-in case-sensitive: owners locked out by their keyboard.

**Consequences.** Better Auth's sign-in response includes the placeholder email: the app never displays `email`.

## D16. The first platform admin

**Context.** Spec §14: a seed task creates the super admin from env and refuses if one exists. A Cloudflare Worker has no command line to run a Nitro task on. NUK has no seed: its first admin signs up and is promoted by hand in SQL; Laundry has no sign-up.

**Decision.**
- `seedPlatformAdmin` (identity) creates the admin on a **temporary password**, guarded inside the batch (no super admin may exist).
- Locally: the Nitro task `identity:seed-platform-admin`.
- Deployed: `scripts/platform-admin-sql.ts` (`pnpm admin:sql`) hashes the password locally with Better Auth's `hashPassword` and prints SQL whose inserts are guarded the same way; run it with `wrangler d1 execute --remote --file`.

**Alternatives.** A one-time setup endpoint: an open door on every deployed Worker until used. Typing the hash by hand: error-prone.

**Consequences.** The password is never sent to the Worker or stored in clear; the temporary password must be changed at the first sign-in.

## D17. One shop per user in the database

**Context.** Spec T4 asks for a unique index on Better Auth's `member.user_id`; §17 asked whether our migration can add one without breaking the generated schema.

**Decision.** A hand-written migration (`0001_member_one_shop.sql`, made with `drizzle-kit generate --custom`) adds `member_user_id_unique`. It isn't in the Drizzle schema (Better Auth generates that table's definition), so drizzle-kit neither generates nor drops it.

**Alternatives.** The spec's fallback: enforce it in the platform service only.

**Consequences.** A second membership fails in the database whatever writes it (tested). A future Better Auth migration that rebuilds `member` must keep the index: the test catches its loss.

## D18. Sign-in limits

**Context.** Spec §12: sign-in rate-limited per IP and per username. Better Auth's limiter keys on address and path only.

**Decision.** Better Auth's limiter (`storage: 'database'`): `sign-in/username` 5/min and `change-password` 5/min per address. Ours, in a `before` hook: 10 tries per 10 minutes **per username** across addresses, counted in Better Auth's `rate_limit` table (`username:<name>`). Both only where Better Auth enables rate limiting (production builds).

**Alternatives.** Per address only: a guess spread over many addresses isn't slowed.

**Consequences.** Someone who knows an owner's username can block their sign-in for 10 minutes. Accepted: owners stay signed in for 30 days, and the platform admin can sign them out and reset the password. The per-username count is approximate under concurrency (read then write), enough for a bound on abuse.

## D19. Platform actions and their audit rows

**Context.** Spec §9 lists the platform's shop routes; §6 says `audit_events.shop_id` is null for a platform action. M1.5 builds them: the platform acts on any shop, by the id in the path.

**Decision.**
- The **shops** feature owns the use cases (`shops.service.ts`). It asks **identity** for the organization and owner statements (Better Auth's tables are identity's) and **platform** for the audit row, and runs one batch.
- A platform action's audit row has `shop_id` **null** and the shop as its target (`target_type: 'shop'`). A shop's own history (M2) will have its `shop_id`.
- The super admin types the owner's **temporary password** (spec §4 screen). It's hashed on the server with Better Auth's `hashPassword`, never logged or audited, and must be changed at the first sign-in (password rules: D29).
- Versions: `shop_settings.version` is the shop's version for every platform change (rename, suspend, resume). The batch's `requireOneChange` decides a stale write; there is no separate early check.
- `authorizeShop` refuses a super admin with `403 NO_SHOP` **even if a membership row exists**, and the owner lookups skip super admins, so a stray row can't let the platform act in a shop.

**Alternatives.** A server-generated temporary password shown once (NUK): stronger by default, but the spec's form has the admin choose it and tell the owner. Revisit if admins pick weak ones. `shop_id` set on platform rows (NUK): mixes the platform's actions into the shop's own history.

**Consequences.** `/api/platform/**` takes a shop id from the path, the one place a shop id comes from the client; it never reaches a shop route. Platform routes are pinned to the spec's statements by `server/tests/routes.test.ts`.

## D20. The app shell

**Context.** Spec M1.6: layouts, sign-in, change password, account, i18n, the data composables. NUK's shell serves several workspaces, server rendering and identity checks; Laundry has one SPA session.

**Decision.**
- **One session source: `/api/me`.** It carries what the UI needs and Better Auth's session doesn't (shop, status, statements, `mustChangePassword`). Loaded before the first page draws; `useSession().end()` is the one session boundary.
- **Better Auth's endpoints through `apiFetch`**, not Better Auth's client: five JSON calls (sign in, sign out, change password, list and revoke sessions) with our error handling, generation checks and no extra client bundle or plugin setup.
- **Route access as a pure function** (`accessRedirect`), applied by one global middleware; tested rule by rule.
- **i18n:** `@nuxtjs/i18n` 10.6, `no_prefix` (no locale in URLs), the choice in the `laundry_locale` cookie, English default (D4), files in `app/locales/` (`restructureDir: 'app'`).
- **E2E:** a production build on a seeded local database, Chrome through `playwright-core` (no `@nuxt/test-utils` page helpers): one build per run, every file shares it.

**Alternatives.** Better Auth's Vue client (`useAuthClient`): its own error shape and state beside ours. A locale prefix (`/km/...`): URLs that change with the language for screens behind sign-in, for no gain.

**Consequences.** Better Auth's error codes are mapped to text in `errors.code.*`. A 401 anywhere ends the session in the app.

## D21. Contrast and fonts

**Context.** `@nuxt/a11y` reported 20 contrast failures: white text on Nuxt UI's default `primary-500` (sky) is about 2.8:1. Khmer rendered with a system font that doesn't stack vowel signs (D7 asked M1.6 to measure contrast; i18n.md asked M1.6 to choose the Khmer font).

**Decision.**
- `--ui-primary` is `primary-700` in light mode and `primary-400` in dark mode (`tailwind.css`): white on sky-700 and sky-700 on white both pass AA.
- Fonts: Inter, then Noto Sans Khmer, self-hosted by `@nuxt/fonts` at build. Noto Sans Khmer is declared in `nuxt.config.ts → fonts.families` with the `khmer` subset (`global: true`): as a fallback in the font stack, `@nuxt/fonts` doesn't fetch it by itself.

**Alternatives.** A darker palette (`blue`): changes the look the owner chose (D7). A system Khmer font: missing or broken on many Android phones.

**Consequences.** The build downloads fonts from Google once (CI and local); the deployed app serves them itself. No contrast warnings in the dev server after the change.

## D22. The price list
**Replaced by D31** (the slip studio). Kept for history.

**Context.** Spec M2.1: shop settings and the price list (service types, price items, archive). Prices are integers in the shop's currency (T12), and the spec leaves open how edits look on a phone and how big a list may be.

**Decision.**
- **The currency changes only while the shop has no price item, archived included.** A price is an amount in that currency: switching KHR → USD would turn 13,500៛ into $135.00. Checked inside the settings save's batch (`requireEmptyPriceListStatement` from pricing), so a price added meanwhile can't slip through. `GET /api/shop/settings` says `currencyLocked`.
- **An item's service type is its own shop's, by the database:** a composite foreign key `(shop_id, service_type_id)` → `service_types (shop_id, id)`. The service checks "active" inside the batch.
- **Caps: 50 active service types, 300 active items per shop**, checked inside the batch. Lists are then answered whole (`{ items }`): the price list is reference data for pickers (orders, M2.3), not a growing list.
- **Edits are pages** (`/prices/items/:id`), not modals: Back works without our own history handling, and the unsaved-changes guard is a route guard. The overlay wrappers stay deferred until an overlay holds input.
- **Archived, never restored (yet).** An archived entry is visible on its tab; restoring it is added when an owner asks.
- Owner writes are audited in the shop's own history (`shop_id` set): settings, service types, price items.

**Alternatives.** Converting prices on a currency change (rates the spec rules out, P7). Paginating the price list (a picker would page). Modal editors (Back closes the page under them without the overlay wrappers).

**Consequences.** A shop that wants another currency archives nothing: it needs an empty list, so in practice the currency is chosen before the first price. A shop with more than 300 active prices is refused with `409 PRICE_LIST_FULL`; raise the cap if a real shop needs it.

## D23. Customers
**Replaced by D31** (the slip studio). Kept for history.

**Context.** Spec M2.2: search, create, edit, anonymize, phone normalization, one customer per phone in a shop (spec §6, §16). The spec says phones are normalized "on the server" and that a duplicate phone offers the existing customer.

**Decision.**
- **Normalization lives in the shared contract** (`shared/contracts/phone.ts`, `libphonenumber-js/min`, region KH). The server runs it on every request, so the stored value is always E.164; the app runs the same code for its messages and to show `012 345 678`.
- **The database decides duplicates**: a partial unique index on `(shop_id, phone_e164)`. A violation is `409 PHONE_TAKEN` with a field error; the app then finds that customer by searching the phone and offers "Open …". The error body stays the flat `{ code, message, fieldErrors }` (D9).
- **Search** matches the name (literal, any case) or, for 3+ digits, digits anywhere in the E.164 number after dropping Cambodia's leading `0` (`012 345` finds `+85512345…`). A scan of the shop's rows, like every text search on D1 (`containsText`).
- **Anonymize** sets the name to `''`, the phone and note to `null`, and `anonymized_at`; the customer leaves the list and can't be edited again. Telegram links are revoked in the same batch once they exist (M4).

**Alternatives.** Normalizing in the service only (the app would duplicate the rule for its messages). A `PHONE_TAKEN` body carrying the other customer (a second error shape). A full-text index (D1 has FTS5, but a shop's customers number in the hundreds).

**Consequences.** A phone search by name-like text never matches digits, and a search under 3 digits is a name search. `libphonenumber-js/min` adds its phone metadata to the app bundle and the Worker (the smallest of its metadata sets).

## D24. Orders
**Replaced by D31** (the slip studio). Kept for history.

**Context.** Spec M2.3: create (task flow, `Idempotency-Key`), list, detail, lines, state actions, payment, Today (spec §7, §8.1, §9). The spec also says "no slip → a ticket is generated in the batch", but tickets (table, tokens, serials, batches) are M3.1–M3.2. It leaves open what happens to a paid order whose lines change, and what a replayed request answers.

**Decision.**
- **Tickets wait for M3.** Orders are created without a ticket; M3.1 adds `tickets` and gives every order that has none a generated ticket (a one-off backfill in that step), so "every order has a ticket" holds from M3 on. Until then nothing reads tickets ([D12](#d12-tables-arrive-with-their-first-user)).
- **The state machine is shared** (`ORDER_TRANSITIONS` in `shared/contracts/orders.ts`): the server enforces it, the app shows only the allowed actions from the same table. `orders.rules.ts` holds the server's other pure rules (snapshots, piece limit, "keeps the lines"). Each transition is a conditional update at the version read and in an allowed status, then `requireOneChange`.
- **Totals on the server only.** A line is pieces × price or grams × price per kg ÷ 1000, rounded half up to a whole riel or cent; the order total is their sum. Requests carry price item ids and quantities, never prices or totals (the contract rejects them).
- **Edits keep snapshots.** An edit names kept lines by `lineId` (their names and price stay) and new lines by `priceItemId` (priced now). The lines are deleted and inserted again in the edit's batch.
- **One payment per order, for the whole total** (spec: `payment_status` paid / unpaid). **A paid order's lines can't change** (`409 ORDER_PAID`), its note can: there is no refund or top-up in Phase 1, so a total that moves after payment would be wrong either way. Cancelling a paid order is allowed and notes `paidBeforeCancel`.
- **A replay answers with the record as it is now**: `idempotency_keys.response` stores the record's id, not a copy of the first response. A copy would show a stale order after later changes; the work itself never runs twice.
- **History is `order_events`**, one row per action with its actor. Of order actions only cancel (owner-only, `order: ['cancel']`) also writes an `audit_events` row.
- **Today** counts orders per status, unpaid (not cancelled), made and collected since Phnom Penh midnight (UTC+7, no daylight saving: `startOfShopDay`), and lists ready and unpaid orders (10 each), in one batch.

**Alternatives.** Building `tickets` now without slips or batches (a table half-specified until M3). Partial payments (a `payments` table; the spec has none). Letting a paid order's total change and marking it unpaid again (silently turns a paid order into a debt). Storing the full first response (stale on replay). Auditing every order action twice (`audit_events` and `order_events`).

**Consequences.** M3.1 owns the backfill of tickets for orders made before it. A shop that wants to change a paid order cancels it and makes a new one. The customer page shows the customer's latest 10 orders (`?customerId=` on the order list).

## D25. The paper-slip flow and slip templates
**Replaced by D31** (the slip studio). Kept for history.

**Context.** Testing M2.3 with the owner's eyes: a shop owner shouldn't have to learn our process. Shops already work from a paper slip, a grid of clothing items with a box for each, a service tick, an amount and paid / not paid. The platform runs each shop as a managed service: the super admin sets a shop up to match its slip, and the owner only takes orders. This changes the spec's shop flow (§4, §8.1), by the owner's choice.

**Decision.**
- **The platform sets shops up from slip templates.** A template is a ready-made price list (services, items in slip order, a price per item and service, a currency), kept by the platform (`/api/platform/templates`, `template: ['read', 'write']`).
- **A shop gets a copy, not a link.** Creating a shop from a template writes the shop's own service types and price items in the same batch. A later template change never touches an existing shop's prices or its orders' totals; a fix to a template reaches only new shops.
- **One JSON definition per template** (`slip_templates.definition`), validated by a shared Valibot schema, instead of service, item and price tables: it's read whole and copied once, never searched. The shop's copy goes into the real `service_types` / `price_items` tables, so orders keep their constraints.
- **Mobile first for the shop app**: content up to 640px wide, centred on larger screens; the platform's editors (templates, later the receipt designer) use the full width.
- **Next** (separate PRs): the owner's two pages (a slip-like order form and an orders board), then a receipt image rendered from a design bound to order data and sent on Telegram. Rendering was checked first: resvg (WebAssembly) on Workers shapes Khmer correctly over a background image; a render costs ~350 ms of CPU (Workers Paid plan).

**Alternatives.** Live templates that shops follow (one edit silently reprices many shops). Template tables per service, item and price (more joins, no query needs them). A default list hard-coded in the app (no per-shop slip). Keeping the owner as the one who builds the price list (the cost the owner wants gone).

**Consequences.** The super admin needs a way to change a shop's slip after it's created (D26). The template editor starts from a usual Phnom Penh slip (wash & iron, dry clean, iron × common items) to save typing; its Khmer names need the owner's review.

## D26. The platform keeps each shop's price list
**Replaced by D31** (the slip studio). Kept for history.

**Context.** D25 makes the owner an end user: the platform sets the shop up and makes later changes on request (feedback, new items, price changes). The rule so far was "the platform admin never reads shop data" (spec §5), and the owner held `price: ['write']`.

**Decision.**
- **The owner reads the price list and never changes it** (`price: ['read']` only). Changes go through the platform.
- **The super admin keeps a shop's price list** through platform routes, `/api/platform/shops/:shopId/service-types|price-items` (platform `price: ['read', 'write']`). The shop comes from the path, checked to exist (404 otherwise, `platformShopActor`); the same pricing services and guards run, and the audit row lands in **that shop's** history with the admin as actor.
- **The rule narrows, it doesn't go:** a super admin still never reads a shop's orders or customers, and `/api/shop/**` still answers them `403 NO_SHOP`. A price list is configuration the platform sets, not the shop's customers' data.
- The app shows the same price list pages in both places; a scope (`providePlatformPriceScope`) says where they read, write and link.

**Alternatives.** The owner keeps editing (the learning cost D25 removes). The platform signs in as the owner, or impersonates (no honest audit trail, shares a password). A copy-from-template-again button instead of editing (loses the shop's own changes). D30 allows a copy only into an empty price list, where there are no changes to lose.

**Consequences.** A price change needs the platform; a "contact support" link comes with the owner's pages. The shop's settings (phone, address, currency while the list is empty) stay the owner's for now.

## D27. The owner's two pages
**Replaced by D31** (the slip studio). Kept for history.

**Context.** D25: the owner should use the app like the paper slip, without learning a process. M2.3 built a three-step wizard (find or create a customer, search a dropdown for each line, review), an order list, Today, and Start / Ready / Collect as separate actions.

**Decision.**
- **New order is one screen shaped like the slip**: phone and name, both optional; a tab per service with a box per item (steppers for pieces, kilograms typed); a note; paid or not; Save. After saving, the order number is shown large ("write it on the bag") with Next order.
- **The person at the counter** (`customer: { kind: 'counter', phone, name }`): a phone finds the shop's customer with it, or makes one in the order's batch; no phone makes a walk-in customer (no name or phone, one per order, hidden from the customers list). A name typed for a known phone is ignored. Two orders making the same new phone's customer at once: the second batch fails on the phone's unique index, resolves again and uses the winner (no duplicate). `customer: { kind: 'existing', id }` stays for picking a customer.
- **Why a walk-in is a customer row**, not a null `orders.customer_id`: making the column nullable needs a table rebuild in SQLite, and on D1 dropping `orders` would cascade to `order_lines` (D1 keeps foreign keys on). A customer row with no name and no phone needs no migration and keeps every order's customer join.
- **The orders board is the home**: Waiting (received, or in progress from before) / Ready / Done (collected or cancelled), with counts, a search across all, and one big button per order: Mark ready, then Collected. An unpaid order asks: **paid now and collected** (the payment with its `Idempotency-Key`, then the pickup at the version the payment left; if the pickup fails, the payment stays recorded and the order stays ready) or handed over unpaid.
- **No Start button.** An order goes from received straight to ready; the status stays for orders that have it.
- **More** holds customers, prices (read only, D26), settings, account and **Contact support** (`NUXT_PUBLIC_SUPPORT_URL`). Today, the order list and the wizard are removed; `/orders` goes to the board.

**Alternatives.** A bottom tab bar (three destinations fit the drawer and the in-page buttons). One "collect and pay" server action (a second idempotent write path for little gain: the two calls are each safe to retry). Requiring a phone (paper slips often have none).

**Consequences.** The customers list can't show walk-ins (by design). Telegram linking for a walk-in is per order (spec §8.2: no phone, order-only link). Q7 (paid orders' lines are locked) is unchanged.


## D28. The receipt on Telegram
**Partly replaced by D31:** the receipt designer becomes the studio and links are per order; the renderer, the Khmer fix and the outbox stay.
**Partly replaced by D32:** text is shaped by fontkit and drawn as paths; the one-word-per-`<text>` fix is gone.

**Context.** D25: the customer's paper slip becomes a picture on Telegram, in the shop's own look, plus a message when the order is ready. The spec planned pre-printed QR slips (M3), a ticket page, and grammY for the bot (M4). The owner chose to start with the receipt image and a QR on the counter's screen; printed slips later, if shops want them. Rendering on a Worker has no browser: it must shape Khmer correctly with what runs in WebAssembly.

**Decision.**
- **A receipt design per shop, kept by the platform** (like the price list, D26): the shop's slip artwork as a background (PNG or JPEG, ≤ 1 MB, 200–2000 px a side, stored as base64 in `receipt_designs`) and fields placed on it in its pixels, each bound to the order: a detail (shop, number, date, customer, phone, total, paid or not, note), a price item's quantity, a paid / not-paid tick, a service's tick. Platform statement `receipt: ['read', 'write']`; the upload is the one route the Worker lets past 64 KB.
- **The server renders the PNG with resvg (WebAssembly) and Noto Sans Khmer** (OFL, bundled). resvg drops a space after a Khmer vowel sign and misshapes Khmer after Latin text in one run, so **each word is its own `<text>`**, measured by resvg and placed with a fixed gap. Ticks are drawn shapes (the font has no ✓). The designer draws the same fields in the browser; **Preview** asks the server for its own PNG, which is exactly what the customer gets. A render costs ~0.1–0.7 s of CPU (Workers Paid, Q8).
- **Linking at the counter:** the saved-order screen and the order page show a QR (`t.me/<bot>?start=<token>`), new each time, valid a day, stored as a SHA-256. Scanning opens the platform's one bot (spec P9), which asks for the person's phone with Telegram's share-contact button. **Their own contact** (`contact.user_id` is the sender) **matching the customer's phone** links every order of the customer; anything else (another number, "Only this order", a walk-in with no phone) links that order only (spec §8.2). Links are per shop.
- **Messages:** right after linking, the order's receipt (the PNG with a short caption, or the same as text while the shop has no design); then **ready** and **collected**. They're queued in the change's own batch (the outbox, `notifications`, one row per chat) and sent by `notifications:deliver` every minute and at once after the change, with backoff and at most 5 attempts; a blocked bot ends that chat's links. Messages are in the shop's language (D6) and name the shop.
- **Bot API over `fetch`**, not grammY: two methods and one webhook don't need a framework. The webhook is authenticated by Telegram's secret header.

**Alternatives.** Satori (no Khmer shaping). HarfBuzz in WebAssembly for text (harfbuzzjs builds its callbacks with runtime WebAssembly compilation, which Workers forbid). A fixed receipt layout with the shop's colours (no shop's own look). Browser Rendering (a headless Chrome per receipt: a paid add-on, slower, and a second code path for tests). The background in R2 (another binding and an orphaned-file problem for a file read whole on every render). Pre-printed QR slips first (printing and stock to manage before any shop asked).

**Consequences.** Spec steps M3.1–M4.2 are replaced: no ticket batches, no `/t/:token` page yet. M4.3 follows the spec: reminders (§8.5) through the same outbox, and the order page shows whether the customer is on Telegram and what was sent. A shop without a receipt design still gets text receipts. A verified link follows the customer, not the phone: a later phone change on the customer doesn't move it. Text on the canvas in the browser and in the PNG can differ slightly in Latin letters (the designer falls back to the app's sans font); Preview is the reference.

## D29. A 6-character password, nothing else

**Context.** Spec §12 asked for at least 10 characters and a leaked-password check (Better Auth's `haveIBeenPwned`). The owner chose a shorter, free password (2026-11-17): staff sign in on a shared counter phone, and the check refused short, easy passwords that shops want to use.

**Decision.** A password is **6–128 characters, any characters**: `MIN_PASSWORD_LENGTH = 6` in `shared/contracts/identity.ts`, the one rule for the app's forms, the contracts, Better Auth (`minPasswordLength`), the seed task and `pnpm admin:sql`. The `haveIBeenPwned` plugin is removed, so sign-in and password changes call no outside service.

**Alternatives.** Keep 10 characters with the check (the spec). Keep the check with 6 characters (it would still refuse `123456` and most short passwords people choose).

**Consequences.** Weaker passwords, accepted by the owner. What still protects accounts: sign-in limits per address and per username (D18), the platform admin can sign an owner out everywhere and reset the password, and a super admin's session is short (D14). Revisit with the first real shop, or if an account is taken over.

## D30. A template into an existing shop, while its price list is empty
**Replaced by D31** (the slip studio). Kept for history.

**Context.** D25 copies a template only when a shop is created. A shop created without one (or before its slip's template existed) could only be filled item by item. D26 rejected copying a template again because it would overwrite the shop's own changes.

**Decision.**
- `POST /api/platform/shops/:shopId/apply-template` `{ version, templateId }` (platform `price: ['write'], template: ['read']`) copies an active template's price list and currency into the shop, exactly as a new shop gets them (`newPriceListStatements`).
- **Only while the price list is empty:** no service type and no price item, archived included. Otherwise `409 PRICE_LIST_NOT_EMPTY`. Nothing is ever replaced or merged.
- One batch with its guards: the shop's version (`shop_settings.version`, D19), the empty list and the template still active, so a price or an archive landing between the read and the write stops it. Audit `shop.apply-template` in the platform's rows (D19), the template id in `data`.
- The shop's detail (`PlatformShopDetail`) says `priceListEmpty`; the shop page offers the template picker only then.

**Alternatives.** Replace or merge into an existing list (loses the shop's changes, and orders' lines keep the old price items). Only on the price list page (shared with the owner's read-only view, D26).

**Consequences.** A shop's price list starts from at most one template; after that it's edited by hand. The currency follows the template, which is allowed because the list is empty (D22).

## D31. The slip studio: a template is the paper slip

**Context.** The owner tried the D25–D30 flow and found it still too much to learn, for owners and for the platform. Paper slips have no price per item: a box per item for a count, a service tick, one handwritten amount, and paid / not paid. The price grid (item × service), the customers section, and a receipt designer separate from the order form all came from the old model. The owner chose to start again from the slip (2026-11-17).

**Decision.** The full plan, steps and open questions are in [`plan.md`](plan.md). In short:
- **A Canva-like studio** (desktop, platform only) designs **templates**, over a photo of the shop's paper slip or from a blank canvas: shapes, text, images, shop info, and form fields (number, text, checkbox, choice, plus the fixed-meaning Order No., date, phone, amount and paid). Templates are owned by the platform and **attached to shops** by it. Each publish makes a fixed version, and an order keeps its version.
- **The owner's portal has three items:** Overview (today's orders and Create order), Templates (choose the default among the attached ones), Orders. An order is the filled slip: values as JSON against its template version, plus phone, amount, paid and status (`open`, `picked_up`, `cancelled`).
- **One SVG for screen and customer:** a shared function draws a design with its values, the studio shows it and the server renders it to PNG with resvg (text: see D32). The customer scans a QR and the bot sends that PNG.
- **Removed:** price lists and service types, customers, order lines and the order states of D24, the separate receipt designs, apply-template, reminders. **The amount is typed by the owner**, not computed. The migrations restart from `0000` (only test data exists).
- **Kept:** identity and tenancy, platform shop management, the server core, the app shell, Telegram over `fetch` with its outbox.

**Alternatives.** Simplify the D25–D30 flow (the owner's earlier proposal, still built around the price grid). A canvas library such as Fabric or Konva for the studio (two drawing paths, browser and server, that drift apart). Templates shared with every shop (a template made from one shop's photo carries that shop's name).

**Consequences.**
- The spec's step plan (§18) and D22–D27 and D30 no longer guide work; `plan.md` does.
- The rule "the server recomputes totals" has nothing to recompute: the server still sets the order number, date and template version, and checks every value against the template version.
- A shop with no attached template can't take orders, so the platform attaches one when it creates the shop.

## D32. Studio canvas and slip text
**Partly replaced by D34:** the canvas no longer uses Moveable + Selecto; the fontkit text stays.

**Accepted by the owner 2026-11-17 (plan Q13, Q14).** Replaces D28's Khmer fix (one `<text>` per word) and settles plan §6.3–6.4.

**Context.** Plan §6.4 asked for a spike before choosing the studio's interaction library, and §6.3 kept D28's Khmer fix (resvg, one `<text>` per word). The spike (`app/spike-studio`, `shared/spike-studio`, `server/spike-studio`; page `/spike/studio` on the dev server only; deleted in S1, still in git history at commit `20ac250`) built a small studio on the plan's design: one JSON design, one shared SVG builder, Moveable + Selecto over the SVG, and the same SVG rendered by resvg on the server. Findings:
- **resvg shapes Khmer wrongly, even one word at a time:** `សេវា` draws as `សោ`, `ប្រើប្រាស់` and `ខោ` lose or misplace vowels. 2.6.2 (installed, latest stable) and 2.7.0-alpha.2 draw the same wrong glyphs. So D28's receipts are wrong for common words today.
- **fontkit 3.0.0** (pure JavaScript, MIT) shapes Khmer **glyph-for-glyph the same as HarfBuzz** (glyph ids and positions compared on 5 test strings, including whole mixed Khmer + Latin lines). **fontkit 2.0.4 does not** (a stray glyph before `ស្ត្រី`, a wrong mark in `ក្រុម`). It runs in the browser and in workerd (tested with wrangler): ~5 ms to lay out a line and ~6 ms to rasterise it once warm, no `nodejs_compat` needed. Bundle: ~387 KB minified, ~158 KB gzip.
- **harfbuzzjs still can't run on Workers** (D28's reason, re-tested with 1.6.4: its start-up compiles WebAssembly at runtime, which workerd forbids).
- With text drawn as glyph paths, **the studio's SVG is byte-identical to the server's**, and the browser's pixels match the server PNG (0 of 24,640 ink pixels differ by more than 25%).
- **Moveable 0.53 / vue3-moveable 0.28 and Selecto 1.26 / vue3-selecto 1.12** work on Nuxt 4 / Vue 3.5 over an SVG canvas, at any zoom: press-and-drag, resize, rotate, shift-click and box selection, group drag, snapping to the canvas centre and to other elements, plus our own undo/redo, arrow nudges, Ctrl+scroll zoom about the pointer and Space+drag pan (16 Playwright checks pass). Neither package has had a release since December 2023.

**Decision.**
- **Text is shaped by fontkit 3 in the shared builder and written as glyph `<path>`s.** The SVG holds no `<text>`; resvg only rasterises, with no fonts. The same font files (`NotoSansKhmer-Regular/Bold.ttf`) are loaded by the studio and the server. This replaces D28's one-word-per-`<text>` fix.
- **Moveable + Selecto drive the canvas, and never own the design.** Transparent boxes over the SVG, one per element, are their targets; each drag, resize or rotate event writes x, y, w, h or rotation into the design JSON, and the SVG is rebuilt from it. Swapping the library later touches only this layer.
- **Guard fontkit with tests:** a unit test compares fontkit with harfbuzzjs (which runs in Node) on a corpus of Khmer and mixed strings, so an upgrade that breaks Khmer fails in CI.

**Alternatives.** Polotno (commercial licence, React, renders on a server only through a headless browser). Konva for the whole studio (no SVG export and no Workers rendering: a second drawing path; it stays the fallback for the handles layer only). Keep resvg's text (wrong Khmer). harfbuzzjs (not on Workers). fontkit 2.0.4 (wrong Khmer). Measure in the browser with canvas and draw `<text>` (the server still draws with resvg, so the customer's image stays wrong). Fabric or Konva (two drawing paths, rejected in D31). Writing our own handles (more work now; still possible later, since the library only drives the JSON).

**Consequences.**
- fontkit 3.0.0 was published on 2026-11-11, so it is very new: pin the exact version and keep the HarfBuzz comparison test.
- Moveable and Selecto are unmaintained: pin them and keep them behind the studio's canvas component; fork (MIT) if a bug needs fixing.
- **On-canvas text editing needs an HTML editor over the SVG** (the SVG has no text to edit): show a `contenteditable` box in the same font while editing, and redraw paths when it closes.
- **Lines wrap only at spaces and new lines (Q14).** Khmer has no spaces between words, and each runtime's `Intl.Segmenter` splits words differently (workerd and Node gave different results), so automatic breaks could differ between the studio and the PNG. The platform puts a space or a new line where a long Khmer line may break.
- A Vue detail the spike hit: after a click selects an element, Vue passes Moveable its new target one tick later, so Moveable's "start dragging" must run only while the mouse button is still down. Otherwise the next gesture drags instead of resizing.

## D33. Studio scope: photo first, English only, shop details copied to the order
**Owner, 2026-11-17 (plan Q9, Q10).**

**Context.** Planning the studio's details (plan §5). The plan listed a full Canva-like editor (S2–S5) before any shop could take an order. AGENTS.md requires every screen in English and Khmer. Shop info elements (plan §5.4.4) read the shop's details when the slip is drawn, but an order's image must never change (plan §4).

**Decision.**
- **The main use is a photo of the shop's paper slip with form fields on it.** Shapes and text are for small touches and blank designs. Form fields are what most templates need; shapes and text tools matter for blank designs. (The same day the owner chose PRs by area, so the whole studio, S1–S5, is one PR before the owner portal: plan §9.)
- **The studio is English only:** an exception to the English + Khmer rule, because only the platform uses it. Its strings still go through `en.json` under `studio.*`, so Khmer can be added later; the locale test doesn't require `studio.*` keys in `km.json`, and Khmer falls back to English. The slip itself, its text and the field labels (English and Khmer, both required to publish) are not affected.
- **Shop info elements stay** (shop name, phone, address, logo), and **each order keeps a copy of the shop's details** (name, phone, address, logo image id, currency, language) when it's saved. The slip is drawn from that copy, so an old slip never changes when the shop does.

**Alternatives.** Build only the drawing tools first (most templates don't need them). Translate the studio (cost with no user who needs it). Drop the shop info elements (a phone change means editing and republishing templates). Draw shop info from the live shop details (old slips would change, against plan §4).

**Consequences.**
- S2 changes `test/unit/locales.test.ts` to exempt `studio.*` from the key parity check, and `docs/standards/i18n.md` to say so.
- Step 1's schema gets the copy column on `orders` (plan §7).

## D34. The studio canvas: our own interaction layer
**Owner, 2026-11-17.** Replaces D32's choice of Moveable + Selecto (the fontkit part of D32 stays).

**Mostly superseded by D35** the same day: with AI-made artwork and fields only, the canvas keeps Moveable + Selecto. What stays from D34: each element drawn as its own piece (R1), the behaviour spec (cut to fields), and our own interaction layer as the fallback.

**Context.** The owner tested the studio built in PR B and found it worked badly. Measured with the CPU slowed 4× (a normal laptop) on a 50-element slip: frames of 150–200 ms while dragging, and a group drag blocked for 24 s. Causes:
- every pointer move rebuilt the whole slip SVG and re-shaped every text with fontkit;
- the SVG was re-parsed each time;
- Moveable re-measured every element to snap.

Other problems:
- Moveable and Selecto needed workarounds to hand a gesture from one to the other, and the press-and-drag bugs came from there;
- a CSS `scale()` made outlines thick when zoomed in;
- zoom jumped about 170% per wheel notch;
- neither library has had a release since 2023.

The owner pointed to [opentempl](https://github.com/noah-thing/opentempl) (MIT) as the reference. It draws with SVG too (one renderer for screen and export), and handles interaction in its own HTML overlay with no canvas library. The owner first asked for Konva. Konva would draw the screen with a second painter, beside the SVG the server rasterises, which is the drift D31 rejected.

**Decision.**
- **Each element is its own memoised SVG component**, built from the same per-element output as the server's `slipSvg`, so a move redraws only what moved. Shaped text is cached.
- **The slip is drawn at the zoomed size** (no CSS scale). An **HTML overlay in screen pixels** holds the hover outline, the selection box and handles, the box select, the snap guides and the text editor. It is our own code, modelled on opentempl's `SelectionOverlay`, `transform.ts` and `snap.ts` (MIT notice kept on anything copied).
- **Behaviour is specified first:** [`studio-behaviour.md`](studio-behaviour.md), with a source and a test for every rule (Phase 0). The owner accepted its recommendations (Q-S1–Q-S5).
- **A performance budget is tested:** the spec's P4.
- **The server is unchanged:** the design JSON, saving, publishing, and `slipSvg` → resvg.

**Alternatives.**
- **Keep Moveable + Selecto and only fix the redraw:** faster, but it keeps the fragile hand-off and two unmaintained libraries.
- **Konva for the screen, with a shared layout feeding both painters:** possible, but it adds a painter and a pixel-parity test to keep the two from drifting.
- **Konva's own text:** different Khmer from the customer's PNG.
- **Polotno:** commercial, React.

**Consequences.**
- About 1,000 lines of interaction code are ours: geometry with unit tests, against a spec.
- `vue3-moveable` and `vue3-selecto` are removed in R3.
- The canvas e2e tests drive the overlay's own elements.
- New canvas behaviour is added to `studio-behaviour.md` first, then built.

## D35. AI-made artwork and fields only
**Owner, 2026-11-17.** Replaces the Canva-like studio of D31 and plan §5; D33's main use (a slip with fields on it) becomes the only use.

**Context.** The studio was being rebuilt as a full design editor (D34): text, shapes, icons, images, rotation, snapping and text editing, with a spec of about 110 rules. The owner observed that AI tools now design a slip, or redesign a photo of a shop's paper slip, faster and better than a hand-made editor would let the platform do. The app only needs to say **where the owner's values go** on that slip.

**Decision.**
- **The slip's look is artwork made outside the app** (AI or any design tool) and uploaded. It carries everything printed: the shop's name, contact details, labels, boxes and lines.
- **The studio only places form fields** on the artwork: the field types of plan §5.3, choice groups, fixed-meaning fields, the fill order, Try it, publish checks. No text, shapes, lines, icons, images, shop info elements or rotation; the design's elements are fields only.
- **Artwork formats:**
  - **PNG and JPEG** are stored as uploaded.
  - **SVG is drawn to a PNG in the platform's browser** at upload; only the PNG is stored. The browser shapes Khmer correctly and, drawing an SVG as an image, runs no scripts and fetches nothing. The server's resvg would draw an SVG's `<text>` with wrong Khmer and no fonts (D32), and an SVG would need cleaning before it could be trusted. The platform sees the PNG before saving.
  - **Over 1 MB:** re-encoded in the browser as JPEG to fit the existing limit (D28).
- **Size:** the canvas, and the customer's PNG, take the artwork's size (200–2000 px a side).
- **AI stays outside the app** for now: no API keys, no cost per design, no prompts to maintain.
- **Kept:**
  - the server: templates, versions, publish, attach, the PNG through the shared SVG builder and resvg;
  - fontkit for the values (text fields can hold Khmer, the amount shows ៛);
  - the canvas's Moveable + Selecto (D32), with rotation turned off;
  - each element drawn as its own piece (R1).

**Alternatives.**
- **The Canva-like studio** (D31, D34): far more code and edge cases for what an AI tool does better.
- **An AI button inside the app:** cost and keys now; later, once we know which tool makes good slips.
- **Storing the SVG and drawing it with resvg:** wrong Khmer, missing fonts, and SVG cleaning.
- **PNG and JPEG only:** simpler still, but AI tools often give SVG.

**Consequences.**
- **Element types removed** from the design schema: text, rect, ellipse, triangle, line, icon, image, shopInfo. **Base fields removed:** rotation, opacity, locked, hidden, name. The staging database has test data only; templates made before this must be made again.
- **Templates start** from an artwork or a copy (no blank canvas).
- **Studio code removed:** the Text, Elements, Shop info, Uploads and Layers tabs and the Resize dialog.
- **The behaviour spec is cut** to the rules that apply to fields.
- The shop's logo and the Shop info preview (plan §5.4.4 before) are dropped; the order still keeps a copy of the shop's details for its currency and language (D33).

## D36. English only, and Cancel and copy for mistakes
**Owner, 2026-11-17.** Replaces D4 (English default, Khmer second) and D6 (the shop's customer language); answers plan Q7.

**Context.** Two questions came up after D35:
- **Khmer screens.** With D35, a shop's slip carries its own language: the artwork is made by AI or a designer, in Khmer if the shop wants. Keeping every screen in two languages (two string files, a language switch, `{ en, km }` labels on every field, a shop language setting, a Khmer review of every PR) cost effort on every change.
- **Editing a saved order (Q7).** The owner first chose editing. An edit, though, needs rules for a number already written on the bag, an image the customer may already have, a fixed template version, paid or picked-up orders, and a history of old values.

**Decision.**
- **The app is English only.** `km.json`, the language switch, the shop's `language` setting and the Khmer half of field labels are removed.
  - **A field's label is one free-text string;** the platform writes it in Khmer for a shop that reads Khmer.
  - **`@nuxtjs/i18n` stays with one locale.** It keeps strings out of components, as AGENTS.md requires, and bringing Khmer back would be a second file. Removing it would touch about 40 screens for no gain now.
  - Noto Sans Khmer stays for text users type (labels, a text field's value) and for the slip's values.
- **No edit after save.** On the order page, **Cancel and copy** cancels the order and opens Create order filled with its values; the owner fixes and saves a new order (new number, new QR).
  - "Edit while open and before the customer scans" can be added later if shops ask: it keeps the number and needs no resending.

**Alternatives.**
- **Keep Khmer screens:** right for owners who can't read English. Not chosen: the owner judged the slip in Khmer enough. If owners struggle, `km.json` comes back.
- **Remove `@nuxtjs/i18n` too:** see above.
- **Full editing (Q7 as first chosen):** rules and code for each case above.
- **Cancel only:** the owner retypes everything.

**Consequences.**
- AGENTS.md, `docs/standards/i18n.md` and the review checklist drop the Khmer rules.
- **Labels:** the design's labels change from `{ en, km }` to a string. The staging database has test data only; templates must be made again.
- **The `shop_settings.language` column is no longer read or written.** Dropping it is a later migration (expand, then contract: operations.md → Migrations).
- Step 3 builds Cancel and copy instead of an edit.

## D37. The owner's counter: New order, Preview, save once, reprint
**2026-11-18.** The first owner milestone of plan step 3, built to the product design notes (`docs/product-design/implementation-guide.md`, sheets 01, 02, 10, 11). Keeps D31–D36; the Studio and AI import are untouched.

**Context.** The guide asks for the shortest complete counter loop first: an attached template → fill → preview → save → a number for the bag → print → reopen. A double tap, a retry and a reprint must never make a second order or change the slip. The existing pieces (the design's fields, `checkFill`, the `orders` table, the shared SVG builder) are reused; nothing in the schema changes.

**Decision.**
- **Intake is a form, not the slip-tap filler.** New order lists the design's fields as rows in the fill order (sheet 01): counts with − and + (an empty box counts from 1, − on 1 empties it), text, choices, phone, the amount typed by hand (free-entry slips keep manual amounts, plan §6.8) and Paid / Not paid. `SlipFiller` stays for the studio's Try it.
- **Preview is a second step of the same page** (`?step=preview`; the form stays mounted, so Edit brings back every field exactly as typed). Previewing creates nothing; the Order No. box shows a placeholder.
- **The version the owner filled is sent, and only accepted while it is the latest.** `POST /api/shop/orders` takes `templateVersionId`; the server accepts it only if its template is attached to the shop and published (404 otherwise), checks every value against it (422 `SLIP_VALUES_INVALID`, by field), and guards **inside the batch** that the template is still attached and has no newer version (409 `TEMPLATE_CHANGED`: the app reloads the slip and keeps what still fits). A value is never stored against a version the owner didn't see.
- **One `Idempotency-Key` per New order page,** kept for every retry (`runIdempotent`): a double tap, two requests at once or a retry after a lost answer make one order; a replay answers with that order even after the platform published again.
- **The order page is the saved screen and the reprint.** It draws the slip from the order's own version and shop copy; `?saved=1` adds "Order saved" and Next order; Save & print opens the browser's print dialog once the artwork has loaded. Print again never saves; the browser can't tell whether paper came out, so it is always offered.
- **Printing is the browser's print of the same SVG** (`.print-slip`, a print stylesheet), not a second renderer: what prints is what the server's PNG draws. Paper size in millimetres is later work (guide → Print).
- **Artwork for shops:** `GET /api/shop/templates/:id/images/:imageId` (an attached template's latest version) and `GET /api/shop/orders/:id/images/:imageId` (the order's own version), each serving only an image its design draws. The platform's image route stays platform-only.
- **Statements:** shop `template: ['read']`, `order: ['create', 'read']` for owner and staff (staff not assignable yet, spec P3).
- **`open` is shown as "Received"**, `picked_up` as "Collected" (guide → interaction contract); the stored values don't change.
- **The page shrinks above the phone's keyboard** (`interactive-widget=resizes-content` in the viewport), so the bottom bar's Preview stays in reach while typing.

**Alternatives.**
- **The server always uses the latest version:** a Publish between opening the form and saving would check (or store) values against fields the owner never saw.
- **A server PNG for printing:** one more request per print and a raster on paper; the SVG prints sharp and is already equal to the PNG (D32).
- **Expose `/api/platform/images/:id` to shops:** it would serve any template's artwork to any shop.

**Consequences.**
- No migration: the `orders` columns of step 1 are enough. `orders.values` is typed as `SlipValues`.
- Left for the next milestones (current-state → Open questions): the 768 px content width the guide proposes, a zero-padded number (`#002139`), remembering a chosen default (sheet 05), the Telegram QR on the saved screen (plan step 4), the Orders list and search, Mark paid / Picked up / Cancel and copy.

## D38. The owner portal's rest: Orders, actions, Paper slips, Telegram
**2026-11-18.** The rest of plan steps 3 and 4 that is small to medium, on top of D37. The Ready / In progress lifecycle, item pricing, customers, redesign requests, the phone Studio and AI import stay out (they change D31's product rules or are large).

**Orders and search.** `GET /api/shop/orders` takes `search`: an exact order number (`12`, `#12`) or a phone as typed (`012 345 678`), never a partial text match. The number has its unique index; the phone gets `(shop_id, phone)` (migration `0002`). Text that is neither matches nothing: the slip's other values are JSON and not searched. Filters: state and paid. All in the URL.

**Actions** (plan §3 step 7, §4, D36).
- **Mark paid** takes an `Idempotency-Key` (architecture → Idempotency), **Picked up** and **Cancel** don't (repeating them changes nothing: the second answers 409 `INVALID_STATE`).
- **The rule is checked twice:** `canDo` before the batch for a clear 409 `INVALID_STATE`, and the same condition in the `UPDATE`'s `WHERE` with the version, so a change landing in between stops the batch.
- **Paid stays apart from the state:** an order can be paid while open or after an unpaid pickup, never once cancelled. **An unpaid pickup is allowed** after the app asks; its audit row records who and when (implementation guide → sheet 04). **A paid order can be cancelled** and keeps showing it was paid; refunds are a pilot decision (product notes).
- **Cancel and copy** cancels first, then opens New order (`?copy=<id>`) on the same template's latest version with the values that still fit; the new order gets its own number and key. If the owner leaves New order, the old order stays cancelled: that is what the confirmation says.
- **Statements:** `order:pay` and `order:pick-up` for owner and staff, `order:cancel` for the owner only.
