import { afterAll, beforeAll, describe, expect, inject, it, onTestFailed } from 'vitest'
import type { Browser, Page } from 'playwright-core'
import type { SlipDesign } from '#shared/contracts/slip-design'
import type { TemplateDetail } from '#shared/contracts/templates'
import { createElement } from '#shared/slip/elements'
import { createTemplateWithArtwork } from './support/templates'
import { launchBrowser, newDevice, screenshotOnFailure, signIn } from './support/browser'

// The studio's canvas (plan §5.5, D35): select, drag, nudge, delete, undo and redo, zoom, align,
// copy and paste, on the fields over an artwork. Here a template is seeded through the API.

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
  const created = await createTemplateWithArtwork(page, { name, width: 1200, height: 800 })
  const design: SlipDesign = {
    ...created.design,
    elements: [
      createElement('number', { id: 'r1', x: 100, y: 100, w: 200, h: 120 }),
      createElement('number', { id: 'r2', x: 600, y: 400, w: 200, h: 120 }),
    ],
  }
  await api(page, `/platform/templates/${created.id}`, { method: 'PATCH', body: { version: 1, design } })
  await page.goto(`${host}/platform/templates/${created.id}`)
  await page.getByTestId('box-r1').waitFor()
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

    // Delete removes it.
    await page.keyboard.press('Delete')
    await expect.poll(async () => (await savedDesign(page, id)).elements.map(element => element.id)).toEqual(['r2'])
    await page.keyboard.press('Control+z')
    await expect.poll(async () => (await savedDesign(page, id)).elements.map(element => element.id)).toEqual(['r1', 'r2'])
  })

  it('selects with Shift and a box, and zooms with the keyboard', async () => {
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

    // Zoom: Ctrl + = zooms in, Ctrl + 0 fits again.
    const fitted = await page.getByTestId('zoom-percent').textContent()
    await page.keyboard.press('Control+=')
    await expect.poll(() => page.getByTestId('zoom-percent').textContent()).not.toBe(fitted)
    await page.keyboard.press('Control+0')
    await expect.poll(() => page.getByTestId('zoom-percent').textContent()).toBe(fitted)
  })

  it('aligns two elements, and copies and pastes them (S5)', async () => {
    const page = await newDevice(browser, { width: 1440, height: 900 })
    onTestFailed(screenshotOnFailure('studio-canvas-3', [page]))
    const id = await openSeeded(page, 'Canvas test 3')

    await page.keyboard.press('Control+a')
    await page.getByRole('button', { name: 'Align left' }).click()
    let design = await savedDesign(page, id)
    expect(design.elements.map(element => element.x)).toEqual([100, 100])
    await page.getByRole('button', { name: 'Align top' }).click()
    design = await savedDesign(page, id)
    expect(design.elements.map(element => element.y)).toEqual([100, 100])

    await page.keyboard.press('Control+c')
    await page.keyboard.press('Control+v')
    design = await savedDesign(page, id)
    expect(design.elements).toHaveLength(4)
    expect(design.elements.slice(2).map(element => [element.x, element.y])).toEqual([[120, 120], [120, 120]])
    expect(new Set(design.elements.map(element => element.id)).size).toBe(4)
  })

  it('locks a Shift-drag to its axis, cancels with Esc, copies with Alt, and shows names and sizes (studio-behaviour.md)', async () => {
    const page = await newDevice(browser, { width: 1440, height: 900 })
    onTestFailed(screenshotOnFailure('studio-canvas-4', [page]))
    const id = await openSeeded(page, 'Canvas test 4')
    const centre = async (testId: string) => {
      const box = (await page.getByTestId(testId).boundingBox())!
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    }

    // Hover: the field's name (its type, with no label) over an outline (S7, F6).
    let at = await centre('box-r2')
    await page.mouse.move(at.x, at.y)
    await expect.poll(() => page.getByTestId('hover-label').textContent()).toBe('Number')

    // Shift during a drag keeps it on its main axis (M3).
    at = await centre('box-r1')
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.waitForTimeout(100)
    await page.keyboard.down('Shift')
    await page.mouse.move(at.x + 60, at.y + 15, { steps: 8 })
    await page.mouse.move(at.x + 120, at.y + 25, { steps: 8 })
    await page.mouse.up()
    await page.keyboard.up('Shift')
    let design = await savedDesign(page, id)
    const locked = boxOf(design, 'r1')!
    expect(locked.y).toBe(100)
    expect(locked.x).toBeGreaterThan(150)

    // Esc during a drag puts it back, with nothing saved and no undo step (M5).
    at = await centre('box-r1')
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x + 80, at.y + 80, { steps: 8 })
    await page.keyboard.press('Escape')
    await page.mouse.up()
    expect(boxOf(await savedDesign(page, id), 'r1')).toEqual(locked)
    await page.keyboard.press('Control+z')
    expect(boxOf(await savedDesign(page, id), 'r1')).toEqual({ x: 100, y: 100 })
    await page.keyboard.press('Control+y')

    // Alt at the press drags a copy and leaves the original (M4).
    at = await centre('box-r2')
    await page.keyboard.down('Alt')
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.waitForTimeout(100)
    await page.mouse.move(at.x - 60, at.y + 20, { steps: 8 })
    await page.mouse.move(at.x - 120, at.y + 40, { steps: 8 })
    await page.mouse.up()
    await page.keyboard.up('Alt')
    await expect.poll(async () => (await savedDesign(page, id)).elements.length).toBe(3)
    design = await savedDesign(page, id)
    expect(boxOf(design, 'r2')).toEqual({ x: 600, y: 400 })
    const copy = design.elements[2]!
    expect(copy.x).toBeLessThan(560)
    expect(copy.y).toBeGreaterThan(420)

    // Resizing shows the size as it changes (R6).
    const handle = (await page.locator('.moveable-control.moveable-se').first().boundingBox())!
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(handle.x + 40, handle.y + 30, { steps: 8 })
    await expect.poll(() => page.getByTestId('live-size').textContent()).toMatch(/^\d+ × \d+$/)
    await page.mouse.up()
    await expect.poll(() => page.getByTestId('live-size').count()).toBe(0)

    // Shift+click on a selected field takes it out of the selection (S2).
    await page.keyboard.press('Control+a')
    // By position: the group's drag area lies over its fields.
    at = await centre('box-r1')
    await page.keyboard.down('Shift')
    await page.mouse.click(at.x, at.y)
    await page.keyboard.up('Shift')
    const before = await savedDesign(page, id)
    await page.keyboard.press('ArrowDown')
    const after = await savedDesign(page, id)
    expect(boxOf(after, 'r1')).toEqual(boxOf(before, 'r1'))
    expect(boxOf(after, 'r2')!.y).toBe(boxOf(before, 'r2')!.y + 1)
  })
})
