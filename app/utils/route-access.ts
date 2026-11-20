import type { DeepReadonly } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import type { MeResponse } from '#shared/contracts/identity'
import { safeRedirect } from './redirect'

/** What the page asks for (`definePageMeta`, `app/types/page-meta.d.ts`). */
export interface PageAccess {
  public?: boolean
  area?: 'platform' | 'shop'
  permission?: string
}

interface Destination {
  path: string
  fullPath: string
  query: Record<string, unknown>
  meta: PageAccess
}

/** Where a session starts: the platform's shop list, the shop's Fill slip, or the page that says why not. */
export function homePath(me: DeepReadonly<MeResponse>): string {
  if (me.platformRole === 'superadmin') return '/platform/shops'
  if (me.shop?.status === 'active') return '/'
  return '/unavailable'
}

/**
 * Which page a session may see (spec §4, §10), as a pure decision: `undefined` to go on, else where
 * to go instead. `middleware/auth.global.ts` applies it. The server refuses on its own; this keeps
 * people on pages that work for them.
 */
export function accessRedirect(me: DeepReadonly<MeResponse> | null, to: Destination): RouteLocationRaw | undefined {
  if (!me) {
    if (to.meta.public) return undefined
    return { path: '/sign-in', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }
  if (to.meta.public) return safeRedirect(to.query.redirect) ?? homePath(me)
  if (me.mustChangePassword) return to.path === '/change-password' ? undefined : { path: '/change-password', query: { redirect: to.fullPath } }

  const home = homePath(me)
  if (to.meta.area === 'platform' && me.platformRole !== 'superadmin') return home
  if (to.meta.area === 'shop' && (me.platformRole || me.shop?.status !== 'active')) return home
  if (to.meta.permission && !me.statements.includes(to.meta.permission)) return home
  return undefined
}
