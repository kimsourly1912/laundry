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
- The super admin types the owner's **temporary password** (spec §4 screen). It's hashed on the server with Better Auth's `hashPassword`, never logged or audited, and must be changed at the first sign-in, where Better Auth's leaked-password check applies.
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

**Context.** Spec M2.2: search, create, edit, anonymize, phone normalization, one customer per phone in a shop (spec §6, §16). The spec says phones are normalized "on the server" and that a duplicate phone offers the existing customer.

**Decision.**
- **Normalization lives in the shared contract** (`shared/contracts/phone.ts`, `libphonenumber-js/min`, region KH). The server runs it on every request, so the stored value is always E.164; the app runs the same code for its messages and to show `012 345 678`.
- **The database decides duplicates**: a partial unique index on `(shop_id, phone_e164)`. A violation is `409 PHONE_TAKEN` with a field error; the app then finds that customer by searching the phone and offers "Open …". The error body stays the flat `{ code, message, fieldErrors }` (D9).
- **Search** matches the name (literal, any case) or, for 3+ digits, digits anywhere in the E.164 number after dropping Cambodia's leading `0` (`012 345` finds `+85512345…`). A scan of the shop's rows, like every text search on D1 (`containsText`).
- **Anonymize** sets the name to `''`, the phone and note to `null`, and `anonymized_at`; the customer leaves the list and can't be edited again. Telegram links are revoked in the same batch once they exist (M4).

**Alternatives.** Normalizing in the service only (the app would duplicate the rule for its messages). A `PHONE_TAKEN` body carrying the other customer (a second error shape). A full-text index (D1 has FTS5, but a shop's customers number in the hundreds).

**Consequences.** A phone search by name-like text never matches digits, and a search under 3 digits is a name search. `libphonenumber-js/min` adds its phone metadata to the app bundle and the Worker (the smallest of its metadata sets).

## D24. Orders

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

**Context.** D25 makes the owner an end user: the platform sets the shop up and makes later changes on request (feedback, new items, price changes). The rule so far was "the platform admin never reads shop data" (spec §5), and the owner held `price: ['write']`.

**Decision.**
- **The owner reads the price list and never changes it** (`price: ['read']` only). Changes go through the platform.
- **The super admin keeps a shop's price list** through platform routes, `/api/platform/shops/:shopId/service-types|price-items` (platform `price: ['read', 'write']`). The shop comes from the path, checked to exist (404 otherwise, `platformShopActor`); the same pricing services and guards run, and the audit row lands in **that shop's** history with the admin as actor.
- **The rule narrows, it doesn't go:** a super admin still never reads a shop's orders or customers, and `/api/shop/**` still answers them `403 NO_SHOP`. A price list is configuration the platform sets, not the shop's customers' data.
- The app shows the same price list pages in both places; a scope (`providePlatformPriceScope`) says where they read, write and link.

**Alternatives.** The owner keeps editing (the learning cost D25 removes). The platform signs in as the owner, or impersonates (no honest audit trail, shares a password). A copy-from-template-again button instead of editing (loses the shop's own changes).

**Consequences.** A price change needs the platform; a "contact support" link comes with the owner's pages. The shop's settings (phone, address, currency while the list is empty) stay the owner's for now.

## D27. The owner's two pages

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

**Context.** D25: the customer's paper slip becomes a picture on Telegram, in the shop's own look, plus a message when the order is ready. The spec planned pre-printed QR slips (M3), a ticket page, and grammY for the bot (M4). The owner chose to start with the receipt image and a QR on the counter's screen; printed slips later, if shops want them. Rendering on a Worker has no browser: it must shape Khmer correctly with what runs in WebAssembly.

**Decision.**
- **A receipt design per shop, kept by the platform** (like the price list, D26): the shop's slip artwork as a background (PNG or JPEG, ≤ 1 MB, 200–2000 px a side, stored as base64 in `receipt_designs`) and fields placed on it in its pixels, each bound to the order: a detail (shop, number, date, customer, phone, total, paid or not, note), a price item's quantity, a paid / not-paid tick, a service's tick. Platform statement `receipt: ['read', 'write']`; the upload is the one route the Worker lets past 64 KB.
- **The server renders the PNG with resvg (WebAssembly) and Noto Sans Khmer** (OFL, bundled). resvg drops a space after a Khmer vowel sign and misshapes Khmer after Latin text in one run, so **each word is its own `<text>`**, measured by resvg and placed with a fixed gap. Ticks are drawn shapes (the font has no ✓). The designer draws the same fields in the browser; **Preview** asks the server for its own PNG, which is exactly what the customer gets. A render costs ~0.1–0.7 s of CPU (Workers Paid, Q8).
- **Linking at the counter:** the saved-order screen and the order page show a QR (`t.me/<bot>?start=<token>`), new each time, valid a day, stored as a SHA-256. Scanning opens the platform's one bot (spec P9), which asks for the person's phone with Telegram's share-contact button. **Their own contact** (`contact.user_id` is the sender) **matching the customer's phone** links every order of the customer; anything else (another number, "Only this order", a walk-in with no phone) links that order only (spec §8.2). Links are per shop.
- **Messages:** right after linking, the order's receipt (the PNG with a short caption, or the same as text while the shop has no design); then **ready** and **collected**. They're queued in the change's own batch (the outbox, `notifications`, one row per chat) and sent by `notifications:deliver` every minute and at once after the change, with backoff and at most 5 attempts; a blocked bot ends that chat's links. Messages are in the shop's language (D6) and name the shop.
- **Bot API over `fetch`**, not grammY: two methods and one webhook don't need a framework. The webhook is authenticated by Telegram's secret header.

**Alternatives.** Satori (no Khmer shaping). HarfBuzz in WebAssembly for text (harfbuzzjs builds its callbacks with runtime WebAssembly compilation, which Workers forbid). A fixed receipt layout with the shop's colours (no shop's own look). Browser Rendering (a headless Chrome per receipt: a paid add-on, slower, and a second code path for tests). The background in R2 (another binding and an orphaned-file problem for a file read whole on every render). Pre-printed QR slips first (printing and stock to manage before any shop asked).

**Consequences.** Spec steps M3.1–M4.3 are replaced: no ticket batches, no `/t/:token` page yet; reminders (spec §8.5) are not built. A shop without a receipt design still gets text receipts. A verified link follows the customer, not the phone: a later phone change on the customer doesn't move it. Text on the canvas in the browser and in the PNG can differ slightly in Latin letters (the designer falls back to the app's sans font); Preview is the reference.
