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
