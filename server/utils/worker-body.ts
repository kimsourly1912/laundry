import { MAX_DESIGN_BYTES } from '#shared/contracts/slip-design'
import { IMAGE_MAX_BYTES } from '#shared/contracts/templates'
import { MAX_JSON_BYTES } from './validation'

/** The studio's design: a template's save and preview (`/api/platform/templates/:id`, `…/preview`). */
const DESIGN_PATH = /^\/api\/platform\/templates\/[^/]+(?:\/preview)?$/

/**
 * The largest body the Worker accepts for a path, or `undefined` for no cap (not an API path).
 * API routes take JSON (64 KB); the studio's design and image upload take more (plan S1). Each
 * route still checks its own limit: this only keeps the Worker's memory safe.
 */
export function workerBodyLimit(path: string): number | undefined {
  if (!path.startsWith('/api/')) return undefined
  // An uploaded image, and a redesign request's photo (D39).
  if (path === '/api/platform/images' || path === '/api/shop/template-requests') return IMAGE_MAX_BYTES
  if (DESIGN_PATH.test(path)) return MAX_DESIGN_BYTES
  return MAX_JSON_BYTES
}

function refuse(): Response {
  return Response.json({ code: 'PAYLOAD_TOO_LARGE', message: 'The request is too large.' }, {
    status: 413,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  })
}

/**
 * Nitro 2's Cloudflare entry reads the whole body into memory before any route runs, so a route's
 * own limit (`readValidBody`) comes too late to protect the Worker's memory. This runs first
 * (server/cloudflare-entry.ts): it counts bytes as they arrive and answers 413 past the cap, or
 * returns a request with the same, already-read body.
 */
export async function boundedWorkerRequest(request: Request): Promise<Request | Response> {
  const maxBytes = workerBodyLimit(new URL(request.url).pathname)
  if (maxBytes === undefined || !request.body) return request
  if (Number(request.headers.get('content-length') ?? 0) > maxBytes) {
    await request.body.cancel().catch(() => {})
    return refuse()
  }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel().catch(() => {})
        return refuse()
      }
      chunks.push(value)
    }
  }
  finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new Request(request, { body: bytes })
}
