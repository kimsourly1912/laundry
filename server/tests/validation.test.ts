import { createServer, request } from 'node:http'
import { createApp, eventHandler, toNodeListener } from 'h3'
import type { H3Event } from 'h3'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { MAX_JSON_BYTES, parseInput, readIdParam, readValidBody, readValidQuery } from '#server/utils/validation'

const schema = v.strictObject({
  name: v.pipe(v.string(), v.trim(), v.minLength(1, 'Required')),
  lines: v.array(v.strictObject({ quantity: v.pipe(v.number(), v.minValue(1, 'Must be 1 or more')) })),
})

function caught(run: () => unknown): { statusCode: number, data: { code: string, fieldErrors?: Record<string, string[]> } } {
  try {
    run()
  }
  catch (error) {
    return error as never
  }
  throw new Error('expected a throw')
}

describe('parseInput', () => {
  it('returns the parsed output', () => {
    expect(parseInput(schema, { name: '  Sokha ', lines: [{ quantity: 2 }] })).toEqual({ name: 'Sokha', lines: [{ quantity: 2 }] })
  })

  it('throws 400 VALIDATION_FAILED with messages per field path, unknown keys included', () => {
    const error = caught(() => parseInput(schema, { name: '', lines: [{ quantity: 0 }], shopId: 'other' }))
    expect(error.statusCode).toBe(400)
    expect(error.data.code).toBe('VALIDATION_FAILED')
    expect(error.data.fieldErrors?.name).toEqual(['Required'])
    expect(error.data.fieldErrors?.['lines.0.quantity']).toEqual(['Must be 1 or more'])
    expect(Object.keys(error.data.fieldErrors ?? {})).toContain('shopId')
  })
})

describe('readIdParam', () => {
  const eventWith = (params: Record<string, string>) => ({ context: { params } }) as unknown as H3Event
  const id = '019a8a1e-0c2b-7c6e-9d1f-2b3c4d5e6f70'

  it('returns a valid UUID', () => {
    expect(readIdParam(eventWith({ id }), 'id', 'The order')).toBe(id)
  })

  it('answers 404 (not 400) for anything that is not an id', () => {
    for (const value of ['1', 'abc', '../etc', `${id}x`]) {
      const error = caught(() => readIdParam(eventWith({ id: value }), 'id', 'The order'))
      expect(error.statusCode).toBe(404)
      expect(error.data.code).toBe('NOT_FOUND')
    }
  })
})

describe('readValidQuery', () => {
  it('validates the query string', () => {
    const event = { path: '/api/x?page=2', node: { req: { url: '/api/x?page=2' } } } as unknown as H3Event
    expect(readValidQuery(event, v.strictObject({ page: v.pipe(v.string(), v.toNumber()) }))).toEqual({ page: 2 })
  })
})

describe('readValidBody (over HTTP)', () => {
  const bodySchema = v.strictObject({ name: v.pipe(v.string(), v.trim(), v.maxLength(5)) })

  async function send(body: string, options: { length?: boolean, maxBytes?: number } = {}) {
    const { length, maxBytes } = options
    const app = createApp().use(eventHandler(event => readValidBody(event, bodySchema, { maxBytes })))
    const server = createServer(toNodeListener(app))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const { port } = server.address() as { port: number }
      return await new Promise<{ status: number, body: string }>((resolve, reject) => {
        const headers = { 'content-type': 'application/json', ...(length ? { 'content-length': Buffer.byteLength(body) } : { 'transfer-encoding': 'chunked' }) }
        const req = request({ hostname: '127.0.0.1', port, method: 'POST', headers }, (res) => {
          let answer = ''
          res.on('data', (chunk) => {
            answer += chunk
          })
          res.on('end', () => resolve({ status: res.statusCode!, body: answer }))
        })
        req.on('error', reject)
        req.write(body)
        req.end()
      })
    }
    finally {
      await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())))
    }
  }

  it.each([false, true])('refuses a body over the limit before parsing it (Content-Length sent: %s)', async (length) => {
    expect((await send(JSON.stringify({ name: ' '.repeat(MAX_JSON_BYTES * 2) + 'ok' }), { length })).status).toBe(413)
  })

  it('accepts exactly the limit, counts bytes (not characters), and refuses invalid JSON', async () => {
    const overhead = Buffer.byteLength(JSON.stringify({ name: 'ok' }))
    expect(await send(JSON.stringify({ name: ' '.repeat(MAX_JSON_BYTES - overhead) + 'ok' }))).toEqual({ status: 200, body: '{"name":"ok"}' })
    // Khmer letters are 3 bytes each in UTF-8.
    expect((await send(JSON.stringify({ name: 'ក'.repeat(MAX_JSON_BYTES / 2) }))).status).toBe(413)
    expect((await send('{invalid')).status).toBe(400)
  })

  it('takes a larger limit when the route asks for one', async () => {
    const body = JSON.stringify({ name: ' '.repeat(MAX_JSON_BYTES) + 'ok' })
    expect((await send(body)).status).toBe(413)
    expect(await send(body, { maxBytes: MAX_JSON_BYTES * 2 })).toEqual({ status: 200, body: '{"name":"ok"}' })
  })
})
