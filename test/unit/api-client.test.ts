import { FetchError } from 'ofetch'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, errorText } from '~/utils/api-error'
import { createApiFetch } from '~/utils/api-fetch'

// The app's API client (app/utils/api-fetch.ts, api-error.ts): one error type, the session boundary,
// no retries, nothing from an earlier session.

function httpError(status: number, data: unknown) {
  const error = new FetchError('failed')
  Object.assign(error, { response: { status }, data, status })
  return error
}

function client(options: { fail?: unknown, generation?: { value: number }, onCall?: () => void } = {}) {
  const generation = options.generation ?? { value: 0 }
  const onSessionLost = vi.fn()
  const onPasswordChangeRequired = vi.fn()
  const baseFetch = vi.fn(async () => {
    options.onCall?.()
    if (options.fail) throw options.fail
    return { ok: true }
  })
  const apiFetch = createApiFetch({ baseFetch: baseFetch as never, onSessionLost, onPasswordChangeRequired, sessionGeneration: () => generation.value })
  return { apiFetch, baseFetch, onSessionLost, onPasswordChangeRequired }
}

const reject = (promise: Promise<unknown>) => promise.then(() => undefined, (error: unknown) => error as ApiError)

describe('createApiFetch', () => {
  it('never retries: a retried write could apply twice', async () => {
    const { apiFetch, baseFetch } = client()
    await apiFetch('/platform/shops', { method: 'POST', body: {} })
    expect(baseFetch).toHaveBeenCalledWith('/platform/shops', expect.objectContaining({ retry: 0 }))
  })

  it('401 ends the session in the app', async () => {
    const { apiFetch, onSessionLost } = client({ fail: httpError(401, { data: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }) })
    const error = await reject(apiFetch('/me'))
    expect(error).toMatchObject({ kind: 'unauthorized', status: 401, code: 'UNAUTHENTICATED' })
    expect(onSessionLost).toHaveBeenCalledOnce()
  })

  it('403 PASSWORD_CHANGE_REQUIRED goes to the change-password page; other 403s don\'t', async () => {
    const first = client({ fail: httpError(403, { data: { code: 'PASSWORD_CHANGE_REQUIRED', message: '…' } }) })
    await reject(first.apiFetch('/platform/shops'))
    expect(first.onPasswordChangeRequired).toHaveBeenCalledOnce()
    const second = client({ fail: httpError(403, { data: { code: 'FORBIDDEN', message: '…' } }) })
    await reject(second.apiFetch('/platform/shops'))
    expect(second.onPasswordChangeRequired).not.toHaveBeenCalled()
    expect(second.onSessionLost).not.toHaveBeenCalled()
  })

  it('drops a response that arrives after the session changed: success or failure', async () => {
    const generation = { value: 0 }
    const ok = client({ generation, onCall: () => generation.value++ })
    expect(await reject(ok.apiFetch('/me'))).toMatchObject({ kind: 'aborted' })
    const failed = client({ generation, fail: httpError(401, {}), onCall: () => generation.value++ })
    expect(await reject(failed.apiFetch('/me'))).toMatchObject({ kind: 'aborted' })
    // Nothing of an earlier session's request ends the new one.
    expect(failed.onSessionLost).not.toHaveBeenCalled()
  })
})

describe('ApiError.from', () => {
  it('reads our API\'s body and Better Auth\'s', () => {
    expect(ApiError.from(httpError(409, { data: { code: 'USERNAME_TAKEN', message: 'Taken.', fieldErrors: { 'owner.username': ['Taken'] } } })))
      .toMatchObject({ kind: 'conflict', code: 'USERNAME_TAKEN', serverMessage: 'Taken.', fieldErrors: { 'owner.username': ['Taken'] } })
    expect(ApiError.from(httpError(401, { code: 'INVALID_USERNAME_OR_PASSWORD', message: 'Invalid username or password' })))
      .toMatchObject({ kind: 'unauthorized', code: 'INVALID_USERNAME_OR_PASSWORD' })
  })

  it('never shows a 5xx\'s text', () => {
    expect(ApiError.from(httpError(500, { data: { code: 'INTERNAL', message: 'SQLITE_ERROR near …' } })).serverMessage).toBeUndefined()
  })

  it('no response: network, timeout, aborted; anything else: unknown', () => {
    expect(ApiError.from(new TypeError('Failed to fetch')).kind).toBe('network')
    expect(ApiError.from(Object.assign(new Error('t'), { name: 'TimeoutError' })).kind).toBe('timeout')
    expect(ApiError.from(Object.assign(new Error('a'), { name: 'AbortError' })).kind).toBe('aborted')
    expect(ApiError.from(new TypeError('x is not a function')).kind).toBe('unknown')
  })
})

describe('errorText', () => {
  const messages: Record<string, string> = { 'errors.code.VERSION_CONFLICT': 'Changed meanwhile.', 'errors.kind.network': 'Offline.' }
  const t = (key: string) => messages[key] ?? key
  const te = (key: string) => key in messages

  it('the app\'s text for the code, else the server\'s message, else the kind\'s text', () => {
    expect(errorText(httpError(409, { data: { code: 'VERSION_CONFLICT', message: 'English' } }), t, te)).toBe('Changed meanwhile.')
    expect(errorText(httpError(409, { data: { code: 'SOMETHING_NEW', message: 'English' } }), t, te)).toBe('English')
    expect(errorText(new TypeError('Failed to fetch'), t, te)).toBe('Offline.')
  })
})
