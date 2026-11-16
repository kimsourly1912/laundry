import { ofetch } from 'ofetch'

/**
 * Configures `apiFetch` (same origin, so the session cookie goes along) and the session boundary:
 * a 401 on any request ends the session in the app and goes to sign-in; a temporary password goes
 * to the change-password page (spec §10, §16).
 */
export default defineNuxtPlugin({
  name: 'api',
  setup(nuxtApp) {
    const session = useSession()
    const router = useRouter()

    configureApi(createApiFetch({
      // No hidden retries; a request never hangs.
      baseFetch: ofetch.create({ baseURL: '/api', timeout: 30_000 }),
      onSessionLost: () => {
        if (!session.me.value) return
        session.end()
        const route = router.currentRoute.value
        if (!route.meta.public) nuxtApp.runWithContext(() => navigateTo({ path: '/sign-in', query: { redirect: route.fullPath } }))
      },
      onPasswordChangeRequired: () => {
        if (router.currentRoute.value.path !== '/change-password') nuxtApp.runWithContext(() => navigateTo('/change-password'))
      },
      sessionGeneration: () => session.generation.value,
    }))
  },
})
