/**
 * An image as a route's answer: its bytes with their type. Never cached (personal data, and the
 * `/api/**` rule), never sniffed as another type.
 */
export function imageResponse(bytes: Uint8Array<ArrayBuffer>, type: 'image/png' | 'image/jpeg'): Response {
  return new Response(bytes, {
    headers: { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  })
}
