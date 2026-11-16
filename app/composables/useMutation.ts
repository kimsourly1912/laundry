import { ApiError, errorText, isSilentError } from '~/utils/api-error'
import { invalidate } from '~/utils/invalidate'

interface MutationOptions<TResult> {
  /** Features whose queries on screen to refresh after success (`['platform']`). */
  invalidate?: string[]
  /** Toast after success (an i18n key's text), or none. */
  success?: (result: TResult) => string | undefined
  /**
   * Don't toast a failure: the caller shows it in place (a form's field errors and top alert).
   * A field error always stays in the form, whatever this says.
   */
  inline?: boolean
}

export type MutationResult<TResult> = { ok: true, data: TResult } | { ok: false, error: ApiError }

/**
 * A write (docs/reference/api-client.md): `pending` while it runs, `error` after a failure (an
 * `ApiError`, with `fieldErrors` for the form), queries refreshed and a toast after success. Never
 * throws: `execute` resolves to `{ ok, data | error }`. Not retried, not cancelled on unmount.
 *
 * @example
 * const suspend = useMutation((version: number) => apiFetch(`/platform/shops/${id}/suspend`, { method: 'POST', body: { version } }), {
 *   invalidate: ['platform'],
 *   success: () => t('platform.shop.suspended'),
 * })
 * await suspend.execute(shop.version)
 */
export function useMutation<TInput, TResult>(fn: (input: TInput) => Promise<TResult>, options: MutationOptions<TResult> = {}) {
  const toast = useToast()
  const { t, te } = useI18n()
  const pending = ref(false)
  const error = shallowRef<ApiError>()

  async function execute(input: TInput): Promise<MutationResult<TResult>> {
    pending.value = true
    error.value = undefined
    try {
      const data = await fn(input)
      if (options.invalidate?.length) await invalidate(...options.invalidate)
      const message = options.success?.(data)
      if (message) toast.add({ title: message, color: 'success', icon: 'i-lucide-circle-check' })
      return { ok: true, data }
    }
    catch (caught) {
      const apiError = ApiError.from(caught)
      error.value = apiError
      if (!options.inline && !isSilentError(apiError)) toast.add({ title: errorText(apiError, t, te), color: 'error', icon: 'i-lucide-circle-alert' })
      return { ok: false, error: apiError }
    }
    finally {
      pending.value = false
    }
  }

  /** Forgets the last error (after the person reloaded or dismissed it). */
  function reset() {
    error.value = undefined
  }

  return { execute, reset, pending: readonly(pending), error: readonly(error) }
}
