import { afterAll, beforeAll, describe, expect, inject, it, onTestFailed } from 'vitest'
import type { Browser, Page } from 'playwright-core'
import type { SlipDesign } from '#shared/contracts/slip-design'
import type { TemplateDetail } from '#shared/contracts/templates'
import { blankDesign } from '#shared/contracts/slip-design'
import { createElement } from '#shared/slip/elements'
import { launchBrowser, newDevice, screenshotOnFailure, signIn } from './support/browser'

// The studio's canvas (plan §5.6, §5.7, S2): select, drag, nudge, delete, undo and redo, Layers,
// zoom. Elements are added by the tools of S3 and S4; here a template is seeded through the API.

const host = inject('e2eHost')
const accounts = inject('e2eAccounts')
let browser: Browser

beforeAll(async () => {
  browser = await launchBrowser()
})

afterAll(async () => {
  await browser?.close()
})

/** A request from the page itself: same origin, with the session. */
function api<T>(page: Page, path: string, init: { method: string, body: unknown }): Promise<T> {
  return page.evaluate(async ({ path, init }) => {
    const response = await fetch(`/api${path}`, { method: init.method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body) })
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
    return response.json()
  }, { path, init }) as Promise<T>
}

async function openSeeded(page: Page, name: string) {
  await page.goto(`${host}/platform/templates`)
  await page.waitForURL(/\/sign-in/)
  await signIn(page, accounts.admin.username, accounts.admin.password)
  await page.waitForURL(`${host}/platform/templates`)
  const created = await api<TemplateDetail>(page, '/platform/templates', { method: 'POST', body: { name, start: { kind: 'blank', width: 1200, height: 800 } } })
  const design: SlipDesign = {
    ...blankDesign(1200, 800),
    elements: [
      createElement('rect', { id: 'r1', x: 100, y: 100, w: 200, h: 120, name: 'First box' }),
      createElement('rect', { id: 'r2', x: 600, y: 400, w: 200, h: 120, name: 'Second box' }, { fill: '#fde68a' }),
    ],
  }
  await api(page, `/platform/templates/${created.id}`, { method: 'PATCH', body: { version: 1, design } })
  await page.goto(`${host}/platform/templates/${created.id}`)
  await page.getByTestId('box-r1').waitFor()
  await page.getByRole('button', { name: 'Layers', exact: true }).click()
  return created.id
}

/** The draft as the server keeps it, once the studio says it's saved. */
async function savedDesign(page: Page, id: string): Promise<SlipDesign> {
  await expect.poll(() => page.getByTestId('save-status').textContent()).toBe('Saved')
  return (await page.evaluate(async id => (await fetch(`/api/platform/templates/${id}`)).json(), id) as TemplateDetail).design
}

const boxOf = (design: SlipDesign, id: string) => {
  const element = design.elements.find(item => item.id === id)
  return element && { x: element.x, y: element.y }
}

describe('studio canvas', () => {
  it('drags, nudges, undoes and redoes, deletes, and saves each change', async () => {
    const page = await newDevice(browser, { width: 1440, height: 900 })
    onTestFailed(screenshotOnFailure('studio-canvas', [page]))
    const id = await openSeeded(page, 'Canvas test')
    const zoom = Number((await page.getByTestId('zoom-percent').textContent())!.replace('%', '')) / 100

    // Press on an unselected element and drag it at once: it moves by the drag / zoom.
    const box = (await page.getByTestId('box-r1').boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(100)
    await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 30, { steps: 8 })
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 60, { steps: 8 })
    await page.mouse.up()
    const dragged = boxOf(await savedDesign(page, id), 'r1')!
    expect(Math.abs(dragged.x - (100 + 100 / zoom))).toBeLessThan(8)
    expect(Math.abs(dragged.y - (100 + 60 / zoom))).toBeLessThan(8)
    await expect.poll(() => page.getByTestId('floating-toolbar').count()).toBe(1)

    // Arrows move the selection 1 px, 10 with Shift.
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Shift+ArrowDown')
    expect(boxOf(await savedDesign(page, id), 'r1')).toEqual({ x: dragged.x + 1, y: dragged.y + 10 })

    // Undo three times: back where it started; redo once.
    await page.keyboard.press('Control+z')
    await page.keyboard.press('Control+z')
    await page.keyboard.press('Control+z')
    expect(boxOf(await savedDesign(page, id), 'r1')).toEqual({ x: 100, y: 100 })
    await page.keyboard.press('Control+y')
    expect(boxOf(await savedDesign(page, id), 'r1')).toEqual(dragged)

    // Delete removes it; Layers lists what's left, top first, then the background.
    await page.keyboard.press('Delete')
    await expect.poll(async () => (await savedDesign(page, id)).elements.map(element => element.id)).toEqual(['r2'])
    expect((await page.getByTestId('layers').locator('li').allTextContents()).map(text => text.trim())).toEqual(['Second box', 'Background'])
    await page.keyboard.press('Control+z')
    await expect.poll(async () => (await savedDesign(page, id)).elements.map(element => element.id)).toEqual(['r1', 'r2'])
  })

  it('selects with Shift and a box, hides and locks in Layers, and zooms with the keyboard', async () => {
    const page = await newDevice(browser, { width: 1440, height: 900 })
    onTestFailed(screenshotOnFailure('studio-canvas-2', [page]))
    const id = await openSeeded(page, 'Canvas test 2')

    // Ctrl+A selects both; Escape none. Shift+click adds the second.
    await page.getByTestId('box-r1').click()
    await page.getByTestId('box-r2').click({ modifiers: ['Shift'] })
    await page.keyboard.press('ArrowLeft')
    const moved = await savedDesign(page, id)
    expect([boxOf(moved, 'r1'), boxOf(moved, 'r2')]).toEqual([{ x: 99, y: 100 }, { x: 599, y: 400 }])
    await page.keyboard.press('Escape')
    await expect.poll(() => page.getByTestId('floating-toolbar').count()).toBe(0)

    // A box dragged on an empty part of the canvas selects everything it touches.
    const canvas = (await page.getByTestId('studio-canvas').boundingBox())!
    const r2 = (await page.getByTestId('box-r2').boundingBox())!
    await page.mouse.move(r2.x - 20, r2.y - 20)
    await page.mouse.down()
    await page.mouse.move(r2.x + 10, r2.y + 10, { steps: 6 })
    await page.mouse.up()
    expect(canvas.width).toBeGreaterThan(0)
    await page.keyboard.press('ArrowUp')
    expect(boxOf(await savedDesign(page, id), 'r2')).toEqual({ x: 599, y: 399 })

    // Lock in Layers: the canvas can't select it any more.
    await page.getByRole('button', { name: 'Lock First box' }).click()
    await savedDesign(page, id)
    expect(await page.getByTestId('box-r1').evaluate(element => getComputedStyle(element).pointerEvents)).toBe('none')
    await page.getByRole('button', { name: 'Hide Second box' }).click()
    expect((await savedDesign(page, id)).elements.find(element => element.id === 'r2')!.hidden).toBe(true)

    // Zoom: Ctrl + = zooms in, Ctrl + 0 fits again.
    const fitted = await page.getByTestId('zoom-percent').textContent()
    await page.keyboard.press('Control+=')
    await expect.poll(() => page.getByTestId('zoom-percent').textContent()).not.toBe(fitted)
    await page.keyboard.press('Control+0')
    await expect.poll(() => page.getByTestId('zoom-percent').textContent()).toBe(fitted)
  })
})
