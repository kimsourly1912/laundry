/**
 * Sign out (spec §10): Better Auth ends the session; the app then clears everything it holds for
 * this person and goes to sign-in, even if the request failed (offline: the cookie is the server's
 * to end, and nothing of the person stays on screen).
 */
export function useSignOut() {
  const session = useSession()
  const pending = ref(false)

  async function signOut() {
    pending.value = true
    try {
      await apiFetch('/auth/sign-out', { method: 'POST', body: {} })
    }
    catch {
      // Ended locally below either way.
    }
    finally {
      session.end()
      pending.value = false
      await navigateTo('/sign-in')
    }
  }

  return { signOut, pending: readonly(pending) }
}
