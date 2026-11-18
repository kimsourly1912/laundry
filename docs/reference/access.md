# Access and identity

← [Reference](./README.md) · Rules: [security](../server/security.md)

Source: `server/utils/access.ts`, `server/features/identity/`, `server/auth.config.ts`, `server/api/me.get.ts`.

## Access helpers (`server/utils/access.ts`)

A route calls **exactly one**, first. Each returns the actor the service receives.

| Helper | For | Returns | Refuses with, in order |
|---|---|---|---|
| `requireSignedIn(event)` | signed-in routes outside a surface | `{ userId, requestId }` | 401; 403 `PASSWORD_CHANGE_REQUIRED` |
| `requireShopPermission(event, statements)` | `/api/shop/**` | `ShopActor` | 401; 403 `PASSWORD_CHANGE_REQUIRED`; 403 `NO_SHOP`; 403 `SHOP_SUSPENDED`; 403 `FORBIDDEN` |
| `requirePlatformPermission(event, statements)` | `/api/platform/**` | `PlatformActor` | 401; 403 `PASSWORD_CHANGE_REQUIRED`; 403 `FORBIDDEN` |

```ts
// server/api/shop/orders/[id]/ready.post.ts (M2.3)
const actor = await requireShopPermission(event, { order: ['transition'] })
// actor: { userId, shopId, role: 'owner', statements: ['order:transition', …], requestId }
```

- **`shopId` comes from the user's membership**, never from the request (spec T3).
- **A banned user** is 401 everywhere, whatever their session.
- **A super admin** is `403 NO_SHOP` on every shop route, even if a membership row exists ([D19](../decisions.md#d19-platform-actions-and-their-audit-rows)).
- **An unknown statement** (`{ order: ['transit'] }`) throws an internal error: a bug in the route, never a "no".
- `sessionUser(event)` reads Better Auth's session (via `@nuxtjs/better-auth`'s `getUserSession`); routes don't call it except `/api/me`.

The decisions themselves are `authorizeShop`, `authorizePlatform` and `authorizeSignedIn` in `identity.service.ts`: plain data in, actor out, tested without a server.

## Statements (`identity.permissions.ts`)

`ShopPermission` and `PlatformPermission` type the statements a route may ask for; the tables are in [security → Roles and statements](../server/security.md#roles-and-statements). `grantedShopStatements(role)` and `grantedPlatformStatements(role)` list a role's statements as `resource:action` strings (what `/api/me` sends). Better Auth's own organization and admin statements are never granted.

## `GET /api/me`

```ts
interface MeResponse {
  user: { id: string, name: string, username: string | null }
  mustChangePassword: boolean
  platformRole: 'superadmin' | null
  shop: { id: string, name: string, status: 'active' | 'suspended' } | null
  statements: string[] // the shop's (none while suspended), or the platform's
}
```

401 without a session or for a banned user. Answers **on a temporary password too**, so the app can show the change-password page; every other API refuses then.

## Sessions (`identity.sessions.ts`)

| Constant | Value |
|---|---|
| `SESSION_EXPIRES_IN_S`, `SESSION_UPDATE_AGE_S` | 30 days, 1 day: an owner's sliding session |
| `ADMIN_IDLE_MS`, `ADMIN_MAX_AGE_MS` | 12 hours, 7 days: a super admin's |

`adminSessionExpiry({ createdAt, now })` is the super admin's `expiresAt`: 12 h from now, never past 7 days from sign-in. Better Auth's session hooks apply it on create and on every renewal ([D14](../decisions.md#d14-session-lifetimes)).

## Revocation statements (`#server/features/identity`)

For the platform's own batch, with its audit row (used by `shops.service.ts`):

| Function | Does |
|---|---|
| `revokeSessionsStatements(db, userId)` | Ends every session of the user ("sign owner out everywhere") |
| `resetPasswordStatements(db, { userId, passwordHash, now })` | New temporary password, `mustChangePassword` set, every session ended |

Hash a password with Better Auth's `hashPassword` from `better-auth/crypto`. The other revocation paths are Better Auth's own, configured in `identity.auth.ts`: a password change ends the user's other sessions (whatever the request asks), and `/api/auth/revoke-other-sessions` is "sign out other devices".

## Shops and owners (`#server/features/identity`, for the shops feature)

| Function | Does |
|---|---|
| `newShopStatements(db, { shopId, name, slug, owner, now })` | The organization and the owner (user on a temporary password, password account, `owner` membership); checks the names first (409 `USERNAME_TAKEN` / `SLUG_TAKEN`) |
| `requireShopNamesAvailable(db, { username, slug })` | The same check alone: asked again after a unique violation, to name the field |
| `renameShopStatement(db, shopId, name)` | Renames the organization, for a versioned batch |
| `shopOwners(db, shopIds)`, `shopOwner(db, shopId)` | Each shop's owner (`ShopOwner`); never a super admin |
| `ownerPasswordResetStatements(db, { userId, password, now })` | `resetPasswordStatements` from a password in clear (hashed here) |

## Rules (`identity.rules.ts`)

| Export | Use |
|---|---|
| `MIN_PASSWORD_LENGTH` (6), `MAX_PASSWORD_LENGTH` (128), `MIN_USERNAME_LENGTH` (3), `MAX_USERNAME_LENGTH` (32) | Re-exported from `shared/contracts/identity.ts`, shared with the app ([lists](./lists.md)) |
| `normalizeUsername(name)` | Trimmed, lowercase: one spelling per username, also at sign-in |
| `placeholderEmail(userId)` | `<userId>@users.invalid`: the email Better Auth requires, never shown or mailed ([D15](../decisions.md#d15-accounts-username-and-a-placeholder-email)) |

## The first platform admin

`seedPlatformAdmin({ db, username, passwordHash })` creates a super admin on a temporary password, or refuses with `409 PLATFORM_ADMIN_EXISTS` (checked inside the batch). The e2e seed uses it; local development uses `pnpm seed:admin` instead ([operations → First platform admin](../server/operations.md#first-platform-admin)).

## Better Auth over HTTP

Only these `/api/auth/*` endpoints answer; every other one is `403 FORBIDDEN` (`auth-endpoints.ts`, [D13](../decisions.md#d13-better-auth-endpoint-lockdown)): `get-session`, `sign-in/username`, `sign-out`, `change-password`, `list-sessions`, `revoke-other-sessions`.

## Tests

`server/features/identity/tests/`: `identity.permissions.test.ts`, `identity.service.test.ts` (every refusal in order, one shop per user, `/api/me`, the seed), `identity.auth.test.ts` (Better Auth end to end with faked time: lifetimes, renewal, every revocation path), `auth-endpoints.test.ts` (lockdown, cookie flags, rate limits). Checked by removal: each of 19 guards fails a test when removed.

Test support (`server/tests/support/auth.ts`): `createTestAuth(db, { rateLimit? })`, `signIn(auth, username, password)`, `sessionHeaders(headers)`, `createTestUser`, `createTestShop`, `addMember`, `createOwner`.
