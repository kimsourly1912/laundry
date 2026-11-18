import { describe, expect, it } from 'vitest'
import { svgResponse } from '#server/utils/image-response'

// A slip's SVG (D39) is shown as an image; opened on its own, its CSP still allows nothing active.

describe('svgResponse', () => {
  it('is an SVG that runs nothing, is never cached and is never sniffed', async () => {
    const response = svgResponse('<svg xmlns="http://www.w3.org/2000/svg"/>')
    expect(response.headers.get('content-type')).toBe('image/svg+xml; charset=utf-8')
    expect(response.headers.get('content-security-policy')).toBe('default-src \'none\'; img-src data:; style-src \'unsafe-inline\'')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await response.text()).toBe('<svg xmlns="http://www.w3.org/2000/svg"/>')
  })
})
