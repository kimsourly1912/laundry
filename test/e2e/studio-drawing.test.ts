import { afterAll, beforeAll, describe, expect, inject, it, onTestFailed } from 'vitest'
import type { Browser, Page } from 'playwright-core'
import type { TemplateDetail } from '#shared/contracts/templates'
import { launchBrowser, newDevice, screenshotOnFailure, signIn } from './support/browser'

// Drawing tools (plan §5.3, §5.5, §5.6, S4): text edited on the canvas, its size scaled by a corner,
// shapes and their style, uploaded images on the slip and as the background, and Resize.

const host = inject('e2eHost')
const accounts = inject('e2eAccounts')
let browser: Browser

beforeAll(async () => {
  browser = await launchBrowser()
})

afterAll(async () => {
  await browser?.close()
})

async function saved(page: Page, id: string): Promise<TemplateDetail> {
  await expect.poll(() => page.getByTestId('save-status').textContent()).toBe('Saved')
  return page.evaluate(async id => (await fetch(`/api/platform/templates/${id}`)).json(), id)
}

describe('studio drawing tools', () => {
  it('adds, edits and styles text, shapes and images, and resizes the canvas', async () => {
    const page = await newDevice(browser, { width: 1440, height: 900 })
    onTestFailed(screenshotOnFailure('studio-drawing', [page]))
    await page.goto(`${host}/platform/templates`)
    await page.waitForURL(/\/sign-in/)
    await signIn(page, accounts.admin.username, accounts.admin.password)
    await page.waitForURL(`${host}/platform/templates`)
    const created = await page.evaluate(async () => (await fetch('/api/platform/templates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Drawing test', start: { kind: 'blank', width: 1200, height: 800 } }) })).json()) as TemplateDetail
    await page.goto(`${host}/platform/templates/${created.id}`)

    // Text: added, then edited in place; its height fits its lines.
    await page.getByRole('button', { name: 'Text', exact: true }).first().click()
    await page.getByRole('button', { name: 'Heading', exact: true }).click()
    let design = (await saved(page, created.id)).design
    const heading = design.elements[0]!
    await page.getByTestId(`box-${heading.id}`).dblclick()
    await page.getByTestId('text-editor').fill('ហាងបោកអ៊ុត\nLinda Laundry')
    await page.keyboard.press('Escape')
    design = (await saved(page, created.id)).design
    expect(design.elements[0]).toMatchObject({ type: 'text', text: 'ហាងបោកអ៊ុត\nLinda Laundry', size: 48 })
    expect(design.elements[0]!.h).toBeCloseTo(2 * 48 * 1.4, 0)

    // A corner handle scales the text's size with its box.
    const before = (await page.getByTestId(`box-${heading.id}`).boundingBox())!
    await page.getByTestId(`box-${heading.id}`).click()
    const corner = page.locator('.moveable-control.moveable-se')
    const handle = (await corner.boundingBox())!
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(handle.x + before.width / 2, handle.y + before.height / 2, { steps: 10 })
    await page.mouse.up()
    design = (await saved(page, created.id)).design
    expect(design.elements[0]!.type === 'text' && design.elements[0]!.size).toBeGreaterThan(60)

    // A rectangle with no fill and a dashed border.
    await page.getByRole('button', { name: 'Elements', exact: true }).click()
    await page.getByRole('button', { name: 'Rectangle', exact: true }).click()
    await page.getByRole('button', { name: 'Style', exact: true }).click()
    await page.getByRole('button', { name: 'None' }).first().click()
    await page.getByLabel('Dashed', { exact: true }).check()
    await page.keyboard.press('Escape')
    design = (await saved(page, created.id)).design
    expect(design.elements[1]).toMatchObject({ type: 'rect', fill: null, dashed: true })

    // An uploaded image on the slip, then as the background.
    await page.getByRole('button', { name: 'Uploads', exact: true }).click()
    const photo = await page.screenshot({ clip: { x: 0, y: 0, width: 400, height: 300 } })
    await page.getByTestId('upload-input').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: photo })
    // The upload answers first; then the image is added and saved.
    await expect.poll(async () => (await saved(page, created.id)).design.elements.length).toBe(3)
    design = (await saved(page, created.id)).design
    expect(design.elements[2]).toMatchObject({ type: 'image', w: 400, h: 300 })
    await page.getByRole('button', { name: 'Set as background', exact: true }).click()
    design = (await saved(page, created.id)).design
    expect(design.elements.map(element => element.type)).toEqual(['text', 'rect'])
    expect(design.background.imageId).not.toBeNull()

    // Resize the canvas.
    await page.getByRole('button', { name: 'Resize', exact: true }).click()
    await page.getByRole('dialog').getByRole('spinbutton').first().fill('1000')
    await page.getByRole('dialog').getByRole('spinbutton').nth(1).fill('700')
    await page.getByRole('dialog').getByRole('button', { name: 'Resize' }).click()
    design = (await saved(page, created.id)).design
    expect([design.width, design.height]).toEqual([1000, 700])
  })
})
