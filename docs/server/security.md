# Security

← [Docs](../README.md) · Layers: [architecture.md](./architecture.md) · Queries: [repositories.md](./repositories.md)

Identity, roles and statements, access helpers, sessions, passwords, request protection, secrets, logging, and the checklist every route passes. Request protection is built ([reference/request-protection.md](../reference/request-protection.md)); identity and access come in M1.4–M1.5; items the spec lists as **needs verification** (§17) are settled in M1.4 and recorded in `decisions.md`.

---

## What the libraries do

Use these; don't rebuild them. Check each against its docs for the installed version.

| Need | Use |
|---|---|
| Accounts, passwords, sessions, cookies | Better Auth (`@nuxtjs/better-auth`) |
| Sign-in with a username | Better Auth `username` plugin |
| Super admin role, ban fields, banned-sign-in check | Better Auth `admin` plugin |
| Shop = organization, membership | Better Auth `organization` plugin |
| Permission statements | Better Auth `createAccessControl` |
| Rate limit of auth routes | Better Auth `rateLimit` |
| Leaked-password check | Better Auth `haveIBeenPwned` plugin (NUK's range API pattern) |
| Security headers | Nitro `routeRules` headers (`nuxt.config.ts`, production builds) |
| Backups | D1 Time Travel |

## Identity

- **No self-signup** (spec P1). The platform admin creates each shop and its owner through `/api/platform/**`.
- **One user belongs to exactly one shop** (spec P2): a unique index on `member.user_id`, added by our migration (spec T4; how is verified in M1.4).
- **Owners sign in with username + password** (spec P4). If Better Auth requires `user.email`, a placeholder (`<id>@users.invalid`) is stored, never shown, never mailed (verified in M1.4).
- **The super admin** has `user.role = 'superadmin'` (admin plugin), is **never a member of a shop** and never reads shop data (spec T5).
- **The first super admin** is created by a seed task from `NUXT_PLATFORM_ADMIN_USERNAME` / `_PASSWORD`. It refuses if any super admin exists.

## Roles and statements

Defined **once** in `server/features/identity/identity.permissions.ts` with `createAccessControl`. Routes check **statements**, never role names. Exact match, **default deny**. An unknown statement is an internal error, not a "no".

### Shop statements

| Resource | Actions | owner | staff (Phase 2) |
|---|---|:-:|:-:|
| shop | read | ✓ | ✓ |
| shop | update | ✓ | |
| price | read | ✓ | ✓ |
| price | write | ✓ | |
| customer | read, write | ✓ | ✓ |
| customer | anonymize | ✓ | |
| order | read, create, update, transition | ✓ | ✓ |
| order | cancel | ✓ | |
| payment | record | ✓ | ✓ |
| ticket | bind | ✓ | ✓ |
| report | read | ✓ | |

The `staff` role exists in the map but is not assignable until Phase 2 (spec P3).

### Platform statements (super admin only)

| Resource | Actions |
|---|---|
| shop | create, read, update, suspend |
| owner | create, reset-password, revoke-sessions |
| ticketBatch | create, read, void |

Rules:
- **Platform statements never grant shop statements.** A super admin calling `/api/shop/**` gets `403 NO_SHOP`.
- **A suspended shop:** its owner can sign in and sees a "shop suspended" page; every `/api/shop/**` call returns `403 SHOP_SUSPENDED`; its public ticket pages show "unavailable"; no messages are sent.
- **Better Auth's `organization`, `member`, `invitation` and `ac` endpoints are blocked** for everyone (`403`). Shops and owners are created only through `/api/platform/**`. Server code calls `auth.api.*` directly and is unaffected.
- The app reads granted statements from `/api/me` to show or hide actions. **The server always checks again.**

## Access helpers

In `server/utils/access.ts`. A route calls **exactly one**, first.

| Helper | Used by | Refuses with |
|---|---|---|
| `requireSignedIn(event)` | `/api/me` | 401; 403 `PASSWORD_CHANGE_REQUIRED` |
| `requireShopPermission(event, statements)` | `/api/shop/**` | 401; 403 `PASSWORD_CHANGE_REQUIRED`; 403 `NO_SHOP` (no membership, including super admins); 403 `SHOP_SUSPENDED`; 403 `FORBIDDEN` |
| `requirePlatformPermission(event, statements)` | `/api/platform/**` | 401 (including the admin's expired idle time or absolute cap); 403 `PASSWORD_CHANGE_REQUIRED`; 403 `FORBIDDEN` |

Each returns an **actor** that services receive: `{ userId, shopId, role, statements }` for a shop, `{ userId, platformRole }` for the platform. **`shopId` comes from the membership, never from the request.**

`mustChangePassword` blocks every API except `/api/me`, change password and sign-out (`403 PASSWORD_CHANGE_REQUIRED`).

## Sessions (spec T16)

Goal: **a shop owner never meets the sign-in page in normal use.** Safety comes from revocation, not expiry.

| | Shop owner | Super admin |
|---|---|---|
| Storage | Better Auth database session; cookie HttpOnly, Secure, SameSite=Lax | same |
| Idle lifetime (sliding) | **30 days** (`expiresIn`), renewed at most once a day (`updateAge`) | **12 hours** |
| Absolute cap | none | **7 days** from session creation |

Better Auth's `expiresIn` is global; the admin's shorter idle time and absolute cap are probably our own checks on `session.updatedAt` / `session.createdAt` in `requirePlatformPermission`, which revoke the session (verified in M1.4).

**Revocation** (each takes effect on the next request):
- The owner changes their password → all their **other** sessions are revoked.
- The admin resets the owner's password → **all** owner sessions are revoked, and `mustChangePassword` is set.
- The owner taps "Sign out other devices" on `/account`.
- The admin taps "Sign owner out everywhere" (lost or stolen phone).
- User banned → sessions revoked.
- Shop suspended → sessions stay; shop APIs answer `403 SHOP_SUSPENDED`.

**No access + refresh token pair.** A sliding server-side session meets the goal and is revocable at once; a token pair adds refresh races between tabs for little gain on one origin. Revisit only for a native app or an outside API client.

Accepted tradeoff: a stolen session cookie works until revoked or unused for 30 days. The cookie is HttpOnly, and the revocation paths cover a lost phone.

**In the app:** on any `401` (signed out, password changed elsewhere, session revoked), clear identity-bound queries, drafts and UI, then go to sign-in (spec §10, M1.6).

## Passwords

- Minimum 10 characters; checked against the leaked-password list.
- The admin sets a temporary password; the owner must change it at first sign-in. A forgotten password → the admin resets it. No email or SMS.
- Sign-in is rate-limited per IP and per username.

## Tenant isolation

- The shop comes from the session. Shop APIs have no shop id or slug in path, query or body (spec T3).
- Every shop table has `shop_id`; every query filters by it ([repositories → The tenant rule](./repositories.md#the-tenant-rule)).
- Another shop's record answers the **same `404`** as a missing one. Never confirm it exists.
- **Every table and query has a two-shop test** (`*.tenants.test.ts`): remove the filter and the test must fail.

## Request protection

| Protection | Rule |
|---|---|
| **CSRF / origin** | Every non-GET request to `/api/**` except `/api/auth/**` (Better Auth checks its own) and `/api/webhooks/**` must carry an `Origin` (or `Referer`) from the trusted origins, else `403`. `GET` never changes state. A sibling subdomain of `angder.app` is not trusted. |
| **Telegram webhook** | `/api/webhooks/telegram` compares `X-Telegram-Bot-Api-Secret-Token` with `NUXT_TELEGRAM_WEBHOOK_SECRET` in constant time **before** reading the body (401 otherwise). No session, no origin check. It can only link a chat after the phone check and record contacts (spec §8.2). |
| **Rate limits** | Workers rate-limit bindings per client address ([D10](../decisions.md#d10-rate-limits)): `/api/public/**` 300/min, `/api/webhooks/**` 600/min; `429 RATE_LIMITED` with `Retry-After: 60`. Nothing limited where no binding exists (dev, tests). Sign-in per IP and username: Better Auth's own limits (M1.4). `/api/health` is never limited. |
| **Headers** | Production builds, every route: CSP (`default-src 'self'`, scripts and styles also `'unsafe-inline'` for the SPA shell), HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: strict-origin`, `Permissions-Policy` denying camera, microphone, geolocation, payment. **Slip scanning (M3.2) needs `camera=(self)`** on the shop pages that scan; loosen only there. `/api/**`: `Cache-Control: no-store`. Set in `nuxt.config.ts`. |
| **Ticket page** | `/t/**`: `Cache-Control: no-store, no-transform`, no analytics. Its URL carries a bearer token; `strict-origin` keeps it out of referrers. |
| **No `v-html`** | ESLint error. Vue's escaping is the XSS defense while the CSP allows inline scripts. |
| **Case-sensitive paths** | `router.options.sensitive`: one spelling per page, so checks on paths can't be skipped by case. |
| **Body size** | `/api/**` bodies ≤ 64 KB, counted in bytes as they arrive: by the Worker's entry before Nitro buffers the body ([D11](../decisions.md#d11-worker-body-cap)), and again by `readValidBody`. `413 PAYLOAD_TOO_LARGE`. |
| **Enumeration** | Other shops' records are `404`. Sign-in errors don't say whether the username exists. |

## Ticket tokens

- 128-bit random, base64url, 22 characters (spec §6). Generated with a cryptographic random source.
- Looked up by exact match on a unique index: **token → ticket → order**.
- **The public response never contains customer identity** (no name, no phone): shop name and phone, order number, status, total, payment status, policy text only.
- A voided ticket or a suspended shop's ticket shows "unavailable".

## Secrets

| Secret | Where |
|---|---|
| `NUXT_BETTER_AUTH_SECRET` | Per environment, ≥ 32 random characters |
| `NUXT_TELEGRAM_BOT_TOKEN` | Per environment (dev, staging and production bots differ) |
| `NUXT_TELEGRAM_WEBHOOK_SECRET` | Per environment, 32–256 of `A-Z a-z 0-9 _ -` |
| `NUXT_PLATFORM_ADMIN_PASSWORD` | Seed only; change the password after the first sign-in |
| Cloudflare API token (CI) | GitHub Actions secret, used only by jobs whose actions are pinned to full commit ids |

Never in the repo, never logged, never in error messages. `.env` is git-ignored; `.env.example` lists names only.

## Logging and privacy

- Every request gets a **request id** (Cloudflare's `cf-ray` when present), in logs and in 5xx error bodies.
- Structured logs: level, request id, route, actor id, code, duration.
- **Never log** passwords, session tokens, cookies, ticket tokens, phone numbers, Telegram chat ids or full request bodies.
- Personal data (customer name, phone) only where needed. Audit metadata records **which fields** changed, not their values.
- **Anonymize** a customer: name and phone cleared, Telegram links revoked, orders kept and shown as "Former customer" (spec P11).

## Route checklist

Every route:

- [ ] Calls **exactly one access helper first**, or is listed as public / webhook / health.
- [ ] Validates params, query and body with a strict shared contract.
- [ ] Never reads `shopId`, `userId`, role, ownership or price from the client.
- [ ] Edits send `version`; order create and payment take an `Idempotency-Key`.
- [ ] Another shop's record answers `404`.
- [ ] Privileged writes add an audit row in the same batch.
- [ ] Errors come from `*.errors.ts` or shared codes; no stack traces or SQL in responses.
- [ ] The response is mapped; nothing the caller shouldn't see.
- [ ] Logs carry the request id and no phone numbers, tokens or passwords.
- [ ] Tests: permission refusals, each error code, the stale-version or replay case, two-shop isolation.
