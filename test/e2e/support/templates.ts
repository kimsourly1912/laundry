import type { Page } from 'playwright-core'
import type { TemplateDetail } from '#shared/contracts/templates'

/**
 * A new template through the API, as the studio makes one (D35): the page draws a plain PNG of
 * `width` × `height` as the artwork, uploads it and starts the template from it. The page must be
 * signed in as the platform.
 */
export function createTemplateWithArtwork(page: Page, options: { name: string, width: number, height: number }): Promise<TemplateDetail> {
  return page.evaluate(async ({ name, width, height }) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')!
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.strokeStyle = '#111827'
    context.lineWidth = 4
    context.strokeRect(20, 20, width - 40, height - 40)
    const png = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png'))
    const upload = await fetch('/api/platform/images?name=artwork.png', { method: 'POST', headers: { 'content-type': 'image/png' }, body: png })
    if (!upload.ok) throw new Error(`${upload.status} ${await upload.text()}`)
    const image = await upload.json() as { id: string }
    const created = await fetch('/api/platform/templates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, start: { kind: 'artwork', imageId: image.id } }) })
    if (!created.ok) throw new Error(`${created.status} ${await created.text()}`)
    return created.json()
  }, options) as Promise<TemplateDetail>
}
