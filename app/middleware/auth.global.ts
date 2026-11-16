import { accessRedirect } from '~/utils/route-access'

/**
 * Waits for `/api/me` before the first page draws, so nothing shown is later removed
 * (page-patterns → States), then applies `accessRedirect` (utils/route-access.ts).
 */
export default defineNuxtRouteMiddleware(async (to) => {
  // The public ticket page (M3.2) has no session.
  if (to.path.startsWith('/t/')) return
  const session = useSession()
  const me = session.loaded.value ? session.me.value : await session.load()
  const target = accessRedirect(me, { path: to.path, fullPath: to.fullPath, query: to.query, meta: to.meta })
  if (target) return navigateTo(target)
})
