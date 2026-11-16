import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'
import { readIdempotencyKey } from '#server/utils/idempotency'

const eventWith = (headers: Record<string, string>) => ({ node: { req: { headers } }, headers: new Headers(headers) }) as unknown as H3Event

describe('readIdempotencyKey', () => {
  it('reads a UUID, lowercased', () => {
    expect(readIdempotencyKey(eventWith({ 'idempotency-key': '0190ABCD-0000-7000-8000-000000000000' }))).toBe('0190abcd-0000-7000-8000-000000000000')
  })

  it('400 when missing or not a UUID', () => {
    for (const headers of [{}, { 'idempotency-key': 'once' }] as Record<string, string>[]) {
      expect(() => readIdempotencyKey(eventWith(headers))).toThrow(expect.objectContaining({ statusCode: 400 }))
    }
  })
})
