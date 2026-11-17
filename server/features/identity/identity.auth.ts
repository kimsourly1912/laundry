import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api'
import { admin, organization, username } from 'better-auth/plugins'
import type { ServerAuthConfig } from '@nuxtjs/better-auth/config'
import { newId } from '#server/utils/ids'
import { authEndpointAllowlist } from './auth-endpoints'
import { platformAc, platformRoles, shopAc, shopRoles } from './identity.permissions'
import { adminSessionExpiry, isSuperAdmin, SESSION_EXPIRES_IN_S, SESSION_UPDATE_AGE_S } from './identity.sessions'
import { MAX_PASSWORD_LENGTH, MAX_USERNAME_LENGTH, MIN_PASSWORD_LENGTH, MIN_USERNAME_LENGTH, normalizeUsername } from './identity.rules'

const MINUTE_S = 60

/** Sign-in tries per username (any address) in a window, besides Better Auth's per-address limit (spec §12). */
export const USERNAME_SIGN_IN_LIMIT = { window: 10 * MINUTE_S, max: 10 }

export interface IdentityAuthSettings {
  /** The public site URL (`NUXT_PUBLIC_SITE_URL`): the only trusted origin besides the request's own. */
  siteUrl?: string
}

interface RateLimitRow {
  key: string
  count: number
  lastRequest: number
}

/**
 * Counts a sign-in try for this username in Better Auth's own `rateLimit` table, and refuses past
 * the limit. Better Auth's limiter keys on the address only; this one stops a guess spread over many
 * addresses. Approximate under concurrency (read then write), like a bound on abuse should be.
 */
async function consumeUsernameTry(ctx: Parameters<Parameters<typeof createAuthMiddleware>[0]>[0], name: string) {
  const key = `username:${normalizeUsername(name)}`
  const now = Date.now()
  const adapter = ctx.context.adapter
  const row = await adapter.findOne<RateLimitRow>({ model: 'rateLimit', where: [{ field: 'key', value: key }] })
  const fresh = !row || now - Number(row.lastRequest) >= USERNAME_SIGN_IN_LIMIT.window * 1000
  if (!fresh && row.count >= USERNAME_SIGN_IN_LIMIT.max) {
    throw new APIError('TOO_MANY_REQUESTS', { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Wait a few minutes and try again.' })
  }
  if (!row) await adapter.create({ model: 'rateLimit', data: { key, count: 1, lastRequest: now } })
  else await adapter.update({ model: 'rateLimit', where: [{ field: 'key', value: key }], update: fresh ? { count: 1, lastRequest: now } : { count: row.count + 1 } })
}

/**
 * Our Better Auth configuration (docs/server/security.md). `server/auth.config.ts` passes it to
 * `defineServerAuth`; the identity tests run it against the real migration.
 */
export function identityAuthOptions(settings: IdentityAuthSettings = {}) {
  const { siteUrl } = settings
  return {
    emailAndPassword: {
      // The password behind the username plugin. No sign-up (spec P1: the platform creates owners).
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      revokeSessionsOnPasswordReset: true,
    },
    advanced: {
      // UUID v7 like our tables, so Better Auth's ids (users, shops) pass `readIdParam`.
      database: { generateId: () => newId() },
      // Rate limits count per client address. Cloudflare sets `cf-connecting-ip` (a client can't
      // forge it); Better Auth's default, `x-forwarded-for`, a client can.
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    },
    trustedOrigins: siteUrl ? [new URL(siteUrl).origin] : [],
    session: {
      expiresIn: SESSION_EXPIRES_IN_S,
      updateAge: SESSION_UPDATE_AGE_S,
    },
    user: {
      additionalFields: {
        // A temporary password: set when the platform creates an owner or resets their password.
        // Better Auth doesn't enforce it; our access helpers refuse with PASSWORD_CHANGE_REQUIRED.
        mustChangePassword: { type: 'boolean', required: false, defaultValue: false, input: false },
      },
    },
    databaseHooks: {
      session: {
        create: {
          // A super admin's session lasts 12 hours idle, 7 days at most (spec T16, D14).
          before: async (session, ctx) => {
            // The core user type doesn't name the admin plugin's `role`; the row has it.
            const user = ctx ? await ctx.context.internalAdapter.findUserById(session.userId) as { role?: string | null } | null : null
            if (!isSuperAdmin(user?.role)) return
            const now = new Date()
            return { data: { ...session, expiresAt: adminSessionExpiry({ createdAt: now, now }) } }
          },
        },
        update: {
          // Renewal: Better Auth moves `expiresAt` to 30 days from now; a super admin's is clamped.
          // The session being renewed is the request's (`ctx.context.session`).
          before: async (data, ctx) => {
            const current = ctx?.context.session
            if (!data.expiresAt || !current || !isSuperAdmin(current.user.role)) return
            const expiresAt = adminSessionExpiry({ createdAt: new Date(current.session.createdAt), now: new Date() })
            return { data: { ...data, expiresAt } }
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-in/username' || typeof ctx.body?.username !== 'string') return
        // Phone keyboards capitalize and add spaces: sign in with the username's one spelling.
        // Better Auth validates the characters before its own normalization runs.
        const name = normalizeUsername(ctx.body.username)
        if (ctx.context.rateLimit.enabled) await consumeUsernameTry(ctx, name)
        return { context: { ...ctx, body: { ...ctx.body, username: name } } }
      }),
      after: createAuthMiddleware(async (ctx) => {
        // A password change ends every other session of the account (spec §12), whatever the
        // request asked, and clears a temporary password. Not when the change was refused.
        if (ctx.path !== '/change-password' || isAPIError(ctx.context.returned)) return
        const current = ctx.context.session
        if (!current) return
        const keep = ctx.context.newSession?.session.token ?? current.session.token
        for (const other of await ctx.context.internalAdapter.listSessions(current.user.id)) {
          if (other.token !== keep) await ctx.context.internalAdapter.deleteSession(other.token)
        }
        await ctx.context.internalAdapter.updateUser(current.user.id, { mustChangePassword: false })
      }),
    },
    rateLimit: {
      // A Worker instance's memory isn't shared with other instances. Better Auth enables rate
      // limiting in production builds only.
      storage: 'database',
      customRules: {
        '/sign-in/username': { window: MINUTE_S, max: 5 },
        '/change-password': { window: MINUTE_S, max: 5 },
        // Asked on every page load, with nothing to guess (the cookie's token is long and random).
        // Counting it would cost a D1 write per request.
        '/get-session': false,
      },
    },
    plugins: [
      // Over HTTP only the endpoints the app uses (auth-endpoints.ts); the server's calls go through.
      authEndpointAllowlist(),
      username({
        minUsernameLength: MIN_USERNAME_LENGTH,
        maxUsernameLength: MAX_USERNAME_LENGTH,
        usernameNormalization: normalizeUsername,
      }),
      admin({
        ac: platformAc,
        roles: platformRoles,
        defaultRole: 'user',
        adminRoles: ['superadmin'],
      }),
      organization({
        // A shop is an organization (spec T2). Shops and members are written by our platform
        // routes (M1.5), never by these endpoints, which are closed over HTTP.
        ac: shopAc,
        roles: shopRoles,
        allowUserToCreateOrganization: false,
        creatorRole: 'owner',
        // Shops are suspended, never deleted (spec §6).
        disableOrganizationDeletion: true,
      }),
    ] as const,
  } satisfies ServerAuthConfig
}
