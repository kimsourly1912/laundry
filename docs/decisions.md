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
