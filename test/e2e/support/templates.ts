import type { Page } from 'playwright-core'
import type { TemplateDetail } from '#shared/contracts/templates'
import type { SlipDesign } from '#shared/contracts/slip-design'

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

/**
 * A shop's counter slip, published and attached (plan §3 steps 1–2): an artwork drawn like a paper
 * slip, the fields placed on its boxes, then Publish and attach to each shop, all through the
 * platform's API. The page must be signed in as the platform.
 */
export function createCounterTemplate(page: Page, options: { name: string, design: SlipDesign, shopNames: string[] }): Promise<TemplateDetail> {
  return page.evaluate(async ({ name, design, shopNames }) => {
    const json = (method: string, body: unknown) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    async function call<T>(path: string, init?: RequestInit): Promise<T> {
      const response = await fetch(path, init)
      if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`)
      return response.json() as Promise<T>
    }
    // The artwork: the shop's printed slip, its boxes where the fields go.
    const canvas = document.createElement('canvas')
    canvas.width = design.width
    canvas.height = design.height
    const ink = canvas.getContext('2d')!
    ink.fillStyle = '#ffffff'
    ink.fillRect(0, 0, design.width, design.height)
    ink.strokeStyle = '#1f2937'
    ink.fillStyle = '#1f2937'
    ink.lineWidth = 3
    ink.strokeRect(12, 12, design.width - 24, design.height - 24)
    ink.font = 'bold 40px sans-serif'
    ink.fillText(name, 40, 70)
    ink.font = '24px sans-serif'
    const labels: [string, number, number][] = [['Order No.', 610, 60], ['Date', 610, 160], ['Customer', 40, 160], ['Item', 40, 225], ['Qty', 380, 225], ['Shirt', 40, 285], ['Pants', 40, 355], ['Wash + iron', 600, 285], ['Iron only', 600, 355], ['Phone', 40, 445], ['Total', 40, 525], ['Paid', 640, 525], ['Not paid', 760, 525]]
    for (const [text, x, y] of labels) ink.fillText(text, x, y)
    ink.lineWidth = 2
    ink.beginPath()
    ink.moveTo(30, 100)
    ink.lineTo(design.width - 30, 100)
    ink.moveTo(30, 240)
    ink.lineTo(520, 240)
    ink.stroke()
    for (const element of design.elements) ink.strokeRect(element.x, element.y, element.w, element.h)
    const png = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png'))
    const image = await call<{ id: string }>('/api/platform/images?name=counter-slip.png', { method: 'POST', headers: { 'content-type': 'image/png' }, body: png })

    const created = await call<TemplateDetail>('/api/platform/templates', json('POST', { name, start: { kind: 'artwork', imageId: image.id } }))
    const saved = await call<TemplateDetail>(`/api/platform/templates/${created.id}`, json('PATCH', { version: created.version, design: { ...design, background: { color: '#ffffff', imageId: image.id } } }))
    const published = await call<TemplateDetail>(`/api/platform/templates/${created.id}/publish`, json('POST', { version: saved.version }))
    const shops = await call<{ items: { id: string, name: string }[] }>('/api/platform/shops?pageSize=100')
    for (const shopName of shopNames) {
      const shop = shops.items.find(item => item.name === shopName)
      if (!shop) throw new Error(`No shop ${shopName}`)
      await call(`/api/platform/templates/${created.id}/shops`, json('POST', { shopId: shop.id }))
    }
    return published
  }, options) as Promise<TemplateDetail>
}

/** Publishes the template again with `change(design)` (its artwork kept): orders made before keep their version. */
export async function republishTemplate(page: Page, options: { id: string, change: (design: SlipDesign) => SlipDesign }): Promise<TemplateDetail> {
  const { id, change } = options
  const current = await page.evaluate(async id => (await fetch(`/api/platform/templates/${id}`)).json(), id) as TemplateDetail
  return page.evaluate(async ({ id, version, design }) => {
    const send = (method: string, body: unknown) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const saved = await (await fetch(`/api/platform/templates/${id}`, send('PATCH', { version, design }))).json() as TemplateDetail
    const published = await fetch(`/api/platform/templates/${id}/publish`, send('POST', { version: saved.version }))
    if (!published.ok) throw new Error(`${published.status} ${await published.text()}`)
    return published.json()
  }, { id, version: current.version, design: change(current.design) }) as Promise<TemplateDetail>
}
