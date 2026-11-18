/**
 * An image as a route's answer: its bytes with their type. Never cached (personal data, and the
 * `/api/**` rule), never sniffed as another type.
 */
export function imageResponse(bytes: Uint8Array<ArrayBuffer>, type: 'image/png' | 'image/jpeg'): Response {
  return new Response(bytes, {
    headers: { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  })
}

/**
 * A slip's SVG as a route's answer (D39). Shown by the app as an image (`<img>`), never as markup;
 * its own CSP forbids anything active even if it were opened on its own.
 */
export function svgResponse(svg: string): Response {
  return new Response(svg, {
    headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': 'default-src \'none\'; img-src data:; style-src \'unsafe-inline\'' },
  })
}
