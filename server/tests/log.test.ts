import type { H3Event } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { log, safeText } from '#server/utils/log'

function captured(level: 'info' | 'error' = 'info') {
  const spy = vi.spyOn(console, level === 'error' ? 'error' : 'log').mockImplementation(() => {})
  return () => JSON.parse(String(spy.mock.calls.at(-1)?.[0])) as Record<string, unknown>
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('log', () => {
  it('writes one JSON line with the level, message and fields', () => {
    const line = captured()
    log('info', 'Order ready', { orderId: 'o-1', count: 2 })
    expect(line()).toEqual({ orderId: 'o-1', count: 2, level: 'info', message: 'Order ready' })
  })

  it('adds the request id, method and a path without its query or ticket token', () => {
    const line = captured('error')
    const event = { context: { requestId: 'req-1' }, method: 'GET', path: '/api/public/tickets/AbCdEf0123456789xyzABC?x=1' } as unknown as H3Event
    log('error', 'Failed', {}, event)
    expect(line()).toMatchObject({ requestId: 'req-1', method: 'GET', path: '/api/public/tickets/[redacted]' })
  })

  it('redacts secret and personal keys at any depth', () => {
    const line = captured()
    log('info', 'x', { password: 'p', nested: { phoneE164: '+85512345678', chatId: 42, botToken: 't', name: 'kept' }, Cookie: 'c' })
    expect(line()).toMatchObject({ password: '[redacted]', Cookie: '[redacted]', nested: { phoneE164: '[redacted]', chatId: '[redacted]', botToken: '[redacted]', name: 'kept' } })
  })

  it('survives cycles, errors and bigints', () => {
    const line = captured()
    const cyclic: Record<string, unknown> = { a: 1 }
    cyclic.self = cyclic
    log('info', 'x', { cyclic, error: new Error('boom'), big: 10n })
    expect(line()).toMatchObject({ cyclic: { a: 1, self: '[circular]' }, error: { name: 'Error', message: 'boom' }, big: '10' })
  })
})

describe('safeText', () => {
  it('removes query strings, URL credentials and the Telegram bot token', () => {
    expect(safeText('GET https://user:pw@laundry.angder.app/api/x?token=abc#h')).toBe('GET https://laundry.angder.app/api/x')
    expect(safeText('POST https://api.telegram.org/bot123:ABC/sendMessage')).toBe('POST https://api.telegram.org/bot[redacted]/sendMessage')
  })

  it('removes ticket tokens from paths', () => {
    expect(safeText('opened /t/AbCdEf0123456789xyzABC today')).toBe('opened /t/[redacted] today')
  })

  it('removes credentials in assignments and auth headers', () => {
    const text = safeText('password=hunter22 Authorization: Bearer abc.def token: xyz')
    for (const secret of ['hunter22', 'abc.def', 'xyz']) expect(text).not.toContain(secret)
    expect(text).toContain('password=[redacted]')
  })

  it('removes Cambodian phone numbers, and keeps dates, times and ids', () => {
    expect(safeText('call +85512345678 or 012 345 678 or 097-123-4567')).toBe('call [phone] or [phone] or [phone]')
    const kept = 'at 2026-11-16T08:40:00.000Z order 019a8a1e-0c2b-7c6e-9d1f-2b3c4d5e6f70 took 1731745200000 ms'
    expect(safeText(kept)).toBe(kept)
  })
})
