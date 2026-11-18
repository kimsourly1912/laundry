# Security

← [Docs](../README.md) · Layers: [architecture.md](./architecture.md) · Queries: [repositories.md](./repositories.md)

Identity, roles and statements, access helpers, sessions, passwords, request protection, secrets, logging, and the checklist every route passes. Built: request protection ([reference/request-protection.md](../reference/request-protection.md)) and identity and access ([reference/access.md](../reference/access.md)). The spec §17 items for identity are settled in D13–D18.

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
| Security headers | Nitro `routeRules` headers (`nuxt.config.ts`, production builds) |
| Backups | D1 Time Travel |

## Identity

- **No self-signup** (spec P1). The platform admin creates each shop and its owner through `/api/platform/**`.
- **One user belongs to exactly one shop** (spec P2): a unique index on `member.user_id` (`member_user_id_unique`), added by our own migration `0001` ([D17](../decisions.md#d17-one-shop-per-user-in-the-database)).
- **Owners sign in with username + password** (spec P4). Better Auth requires `user.email`, so a placeholder (`<id>@users.invalid`) is stored, never shown, never mailed. Usernames are trimmed and lowercased, also at sign-in ([D15](../decisions.md#d15-accounts-username-and-a-placeholder-email)).
- **The super admin** has `user.role = 'superadmin'` (admin plugin), is **never a member of a shop** and never reads shop data (spec T5).
- **The first super admin** is created by a seed task from `NUXT_PLATFORM_ADMIN_USERNAME` / `_PASSWORD`. It refuses if any super admin exists.

## Roles and statements

Defined **once** in `server/features/identity/identity.permissions.ts` with `createAccessControl`. Routes check **statements**, never role names. Exact match, **default deny**. An unknown statement is an internal error, not a "no".

### Shop statements

| Resource | Actions | owner | staff (Phase 2) |
|---|---|:-:|:-:|
| shop | read | ✓ | ✓ |
| shop | update | ✓ | |
| template | read: the attached, published templates and their artwork (New order, Paper slips) | ✓ | ✓ |
| template | set-default: the shop's default slip (plan §4) | ✓ | |
| template | request: ask the platform for a new design, with a private photo (D39) | ✓ | |
| order | create, read | ✓ | ✓ |
| order | work: start, mark ready, rework (D39) | ✓ | ✓ |
| customer | read, write (D39) | ✓ | ✓ |
| price | read (D39) | ✓ | ✓ |
| price | write (D39) | ✓ | |
| order | pay, pick-up | ✓ | ✓ |
| order | cancel (and Cancel and copy) | ✓ | |

The counter milestone ([D37](../decisions.md#d37-the-owners-counter-new-order-preview-save-once-reprint)) added `template:read` and `order:create`, `order:read`; D38 `order:pay`, `order:pick-up`, `order:cancel` and `template:set-default` ([D38](../decisions.md#d38-the-owner-portals-rest-orders-actions-paper-slips-telegram)). Staff run the counter but don't cancel. The `staff` role exists in the map but is not assignable until Phase 2 (spec P3).

### Platform statements (super admin only)

| Resource | Actions |
|---|---|
| shop | create, read, update, suspend |
| owner | create, reset-password, revoke-sessions |
| template | read, write: the studio, images, attaching templates to shops ([D31](../decisions.md#d31-the-slip-studio-a-template-is-the-paper-slip); routes come with S1 and step 2) |

Rules:
- **Platform statements never grant shop statements.** A super admin calling `/api/shop/**` gets `403 NO_SHOP`. The platform touches a shop's settings, owner and attached templates through `/api/platform/shops/:shopId/…` (the shop from the path, 404 when missing, audited); **never its orders** (plan §4). The studio's previews and Try it draw made-up values.
- **A suspended shop:** its owner can sign in and sees a "shop suspended" page; every `/api/shop/**` call returns `403 SHOP_SUSPENDED`; no messages are sent.
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

Better Auth's `expiresIn` is global, so a super admin's `expiresAt` is clamped by Better Auth's session hooks, on sign-in and on every renewal, to 12 h from now and never past 7 days from sign-in. Better Auth itself then refuses the expired session, on every route ([D14](../decisions.md#d14-session-lifetimes)). A renewal extends the same session: the token and the cookie's value stay, only the expiry moves.

**Revocation** (each takes effect on the next request):
- The owner changes their password → all their **other** sessions are revoked.
- The admin resets the owner's password → **all** owner sessions are revoked, and `mustChangePassword` is set.
- The owner taps "Sign out other devices" on `/account`.
- The admin taps "Sign owner out everywhere" (lost or stolen phone).
- User banned → every request with their session is refused 401 by the access helpers, and Better Auth refuses their sign-in. (No ban action exists in Phase 1; the admin plugin's endpoints are closed.)
- Shop suspended → sessions stay; shop APIs answer `403 SHOP_SUSPENDED`.

**No access + refresh token pair.** A sliding server-side session meets the goal and is revocable at once; a token pair adds refresh races between tabs for little gain on one origin. Revisit only for a native app or an outside API client.

Accepted tradeoff: a stolen session cookie works until revoked or unused for 30 days. The cookie is HttpOnly, and the revocation paths cover a lost phone.

**In the app:** on any `401` (signed out, password changed elsewhere, session revoked), clear identity-bound queries, drafts and UI, then go to sign-in (spec §10): `plugins/api.client.ts` → `useSession().end()` ([app-shell](../reference/app-shell.md#the-session)).

## Passwords

- At least 6 characters, at most 128; nothing else: any characters, no leaked-password check ([D29](../decisions.md#d29-a-6-character-password-nothing-else)). Spaces count; never trimmed.
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
| **Telegram webhook** | `/api/webhooks/telegram` compares `X-Telegram-Bot-Api-Secret-Token` with `NUXT_TELEGRAM_WEBHOOK_SECRET` in constant time **before** reading the body; otherwise, or with no bot token set, the same `404` as an unknown path. No session, no origin check. Only private chats with people count. `/start <token>` links the chat to that token's order (below). |
| **Rate limits** | Workers rate-limit bindings per client address ([D10](../decisions.md#d10-rate-limits)): `/api/public/**` 300/min, `/api/webhooks/**` 600/min; `429 RATE_LIMITED` with `Retry-After: 60`. Nothing limited where no binding exists (dev, tests). Sign-in: 5/min per address (Better Auth) and 10 per 10 minutes per username across addresses (ours), production builds only ([D18](../decisions.md#d18-sign-in-limits)). `/api/health` is never limited. |
| **Headers** | Production builds, every route: CSP (`default-src 'self'`, scripts and styles also `'unsafe-inline'` for the SPA shell), HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: strict-origin`, `Permissions-Policy` denying camera, microphone, geolocation, payment. `/api/**`: `Cache-Control: no-store`. Set in `nuxt.config.ts`. |
| **No `v-html`** | ESLint error. Vue's escaping is the XSS defense while the CSP allows inline scripts. |
| **Case-sensitive paths** | `router.options.sensitive`: one spelling per page, so checks on paths can't be skipped by case. |
| **Body size** | `/api/**` bodies ≤ 64 KB, counted in bytes as they arrive: by the Worker's entry before Nitro buffers the body ([D11](../decisions.md#d11-worker-body-cap)), and again by `readValidBody`. `413 PAYLOAD_TOO_LARGE`. Two exceptions, by exact path, platform only (plan S1): the studio's image upload (`POST /api/platform/images`) ≤ 1 MB, its type and size read from the file itself, never from headers; a template's design (`PATCH /api/platform/templates/:id` and `…/preview`) ≤ 256 KB (`MAX_DESIGN_BYTES`). |
| **Enumeration** | Other shops' records are `404`. Sign-in errors don't say whether the username exists. |

## Telegram links ([D28](../decisions.md#d28-the-receipt-on-telegram), plan §8)

Built (D38):
- **The QR** carries a 256-bit random token (base64url, 43 characters), new for each request, valid a day. Only its SHA-256 is stored. Whoever scans it gets **that one order's slip**, nothing more: links are per order (plan §8), so a photo of a QR never gives anyone another order.
- Links are per shop and per order: a row can't pair one shop with another shop's order (composite foreign keys, two-shop tests).
- A blocked bot revokes every link to that chat.
- Messages carry the slip (shop name, order number, amount, paid or not); never the phone in text. Logs never carry chat ids (an outbox row's id ends with one, so it isn't logged either).

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
- **Never log** passwords, session tokens, cookies, QR tokens, phone numbers, Telegram chat ids or full request bodies.
- Personal data (an order's phone) only where needed. Audit metadata records **which fields** changed, not their values.

## Route checklist

Every route:

- [ ] Calls **exactly one access helper first**, or is listed as public / webhook / health.
- [ ] Validates params, query and body with a strict shared contract.
- [ ] Never reads `shopId`, `userId`, role, ownership, order numbers, dates or template versions from the client.
- [ ] Edits send `version`; order create and mark paid take an `Idempotency-Key`.
- [ ] Another shop's record answers `404`.
- [ ] Privileged writes add an audit row in the same batch.
- [ ] Errors come from `*.errors.ts` or shared codes; no stack traces or SQL in responses.
- [ ] The response is mapped; nothing the caller shouldn't see.
- [ ] Logs carry the request id and no phone numbers, tokens or passwords.
- [ ] Tests: permission refusals, each error code, the stale-version or replay case, two-shop isolation.
