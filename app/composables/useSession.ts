import type { MeResponse } from '#shared/contracts/identity'
import { ApiError } from '~/utils/api-error'

/**
 * The signed-in session as `/api/me` describes it (spec §9): who, their shop, the statements the UI
 * may show. Loaded once before the first page draws (`middleware/auth.global.ts`) and after sign-in.
 *
 * `end()` is the session boundary (spec §10): it moves the generation (responses still in flight
 * are dropped by `apiFetch`) and clears every query's data, so nothing of this person stays on
 * screen or in memory for the next one.
 */
export function useSession() {
  const me = useState<MeResponse | null>('session:me', () => null)
  const loaded = useState('session:loaded', () => false)
  const generation = useState('session:generation', () => 0)

  async function load(): Promise<MeResponse | null> {
    try {
      me.value = await apiFetch<MeResponse>('/me')
    }
    catch (error) {
      // 401: not signed in (apiFetch already ended the session). Anything else: shown by the page.
      if (ApiError.from(error).kind !== 'unauthorized') throw error
      me.value = null
    }
    loaded.value = true
    return me.value
  }

  /** Ends the session in the app: after sign-out, a 401, or before another person signs in. */
  function end() {
    generation.value++
    me.value = null
    clearNuxtData()
  }

  /** Whether the session grants the statement (`order:cancel`). For showing actions; the server checks again. */
  function can(statement: string): boolean {
    return me.value?.statements.includes(statement) ?? false
  }

  return { me: readonly(me), loaded, generation: readonly(generation), load, end, can }
}
