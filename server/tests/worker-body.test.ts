import { describe, expect, it } from 'vitest'
import { MAX_RECEIPT_IMAGE_BYTES } from '#shared/contracts/receipts'
import { MAX_JSON_BYTES } from '#server/utils/validation'
import { boundedWorkerRequest, workerBodyLimit } from '#server/utils/worker-body'

const post = (path: string, body: BodyInit, headers: Record<string, string> = {}) =>
  new Request(`https://laundry.angder.app${path}`, { method: 'POST', body, headers, duplex: 'half' } as RequestInit)

function streamOf(size: number, piece = 16 * 1024) {
  let sent = 0
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= size) return controller.close()
      const length = Math.min(piece, size - sent)
      sent += length
      controller.enqueue(new Uint8Array(length))
    },
    cancel() {
      cancelled = true
    },
  })
  return { stream, wasCancelled: () => cancelled }
}

describe('workerBodyLimit', () => {
  it('caps API paths at the JSON limit and leaves pages alone', () => {
    expect(workerBodyLimit('/api/shop/orders')).toBe(MAX_JSON_BYTES)
    expect(workerBodyLimit('/orders/new')).toBeUndefined()
  })

  it('allows the receipt background upload its 1 MB, on that path only', () => {
    expect(workerBodyLimit('/api/platform/shops/01900000-0000-7000-8000-000000000000/receipt/background')).toBe(MAX_RECEIPT_IMAGE_BYTES)
    expect(workerBodyLimit('/api/platform/shops/x/receipt')).toBe(MAX_JSON_BYTES)
    expect(workerBodyLimit('/api/platform/shops/x/receipt/background/more')).toBe(MAX_JSON_BYTES)
    expect(workerBodyLimit('/api/shop/receipt/background')).toBe(MAX_JSON_BYTES)
  })
})

describe('boundedWorkerRequest', () => {
  it('passes a body under the cap through, readable again', async () => {
    const result = await boundedWorkerRequest(post('/api/shop/orders', '{"a":1}'))
    expect(result).toBeInstanceOf(Request)
    expect(await (result as Request).text()).toBe('{"a":1}')
  })

  it('answers 413 for a declared length over the cap, without reading the body', async () => {
    const { stream, wasCancelled } = streamOf(10)
    const result = await boundedWorkerRequest(post('/api/shop/orders', stream, { 'content-length': String(MAX_JSON_BYTES + 1) }))
    expect((result as Response).status).toBe(413)
    expect(await (result as Response).json()).toEqual({ code: 'PAYLOAD_TOO_LARGE', message: 'The request is too large.' })
    expect(wasCancelled()).toBe(true)
  })

  it('stops reading a streamed body as soon as it passes the cap', async () => {
    const { stream, wasCancelled } = streamOf(MAX_JSON_BYTES * 10)
    const result = await boundedWorkerRequest(post('/api/shop/orders', stream))
    expect((result as Response).status).toBe(413)
    expect(wasCancelled()).toBe(true)
  })

  it('leaves page requests and bodiless requests untouched', async () => {
    const page = post('/orders/new', 'x'.repeat(MAX_JSON_BYTES + 1))
    expect(await boundedWorkerRequest(page)).toBe(page)
    const get = new Request('https://laundry.angder.app/api/health')
    expect(await boundedWorkerRequest(get)).toBe(get)
  })
})
