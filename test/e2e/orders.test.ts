import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, inject, it, onTestFailed } from 'vitest'
import type { Browser, Page } from 'playwright-core'
import type { OrderDetail, OrderTemplate } from '#shared/contracts/orders'
import { blankDesign } from '#shared/contracts/slip-design'
import type { SlipDesign } from '#shared/contracts/slip-design'
import type { TemplateDetail } from '#shared/contracts/templates'
import { createElement, createGroup } from '#shared/slip/elements'
import { createCounterTemplate, republishTemplate } from './support/templates'
import { launchBrowser, newDevice, screenshotOnFailure, signIn } from './support/browser'

// The owner's counter (plan §3 steps 4–5; implementation guide → sheets 01, 02, 10): New order on
// the shop's attached slip, Preview, Edit keeps everything, Save & print once (a lost answer and a
// retry make one order), the number for the bag, and the saved slip reopened and printed again on
// its own version after the platform published a new one. Another shop never opens it.
//
// `E2E_SCREENSHOTS=<dir>` also saves the screens at 390 px (2x) for review.

const host = inject('e2eHost')
const accounts = inject('e2eAccounts')
const screenshots = process.env.E2E_SCREENSHOTS
let browser: Browser
let admin: Page
let template: TemplateDetail
let savedOrder: OrderDetail | undefined

/** A paper slip like Linda Laundry's: its boxes on the artwork, Khmer and English labels (D36). */
function lindaDesign(): SlipDesign {
  return {
    ...blankDesign(900, 580),
    elements: [
      createElement('orderNo', { id: 'no', x: 760, y: 30, w: 110, h: 44 }),
      createElement('date', { id: 'day', x: 690, y: 126, w: 180, h: 44 }, { size: 24 }),
      createElement('textField', { id: 'name', x: 170, y: 126, w: 330, h: 44 }, { label: 'អតិថិជន / Customer', size: 26 }),
      createElement('number', { id: 'shirt', x: 360, y: 255, w: 120, h: 44 }, { label: 'អាវ / Shirt', required: true }),
      createElement('number', { id: 'pants', x: 360, y: 325, w: 120, h: 44 }, { label: 'ខោ / Pants' }),
      createElement('option', { id: 'wash', x: 550, y: 258, w: 36, h: 36 }, { group: 'svc', label: 'Wash + iron' }),
      createElement('option', { id: 'iron', x: 550, y: 328, w: 36, h: 36 }, { group: 'svc', label: 'Iron only' }),
      createElement('phone', { id: 'tel', x: 170, y: 415, w: 330, h: 44 }, { size: 26 }),
      createElement('amount', { id: 'total', x: 170, y: 495, w: 330, h: 44 }, { label: 'សរុប / Total', bold: true }),
      createElement('paid', { id: 'yes', x: 595, y: 500, w: 36, h: 36 }, { value: 'paid', label: 'Paid' }),
      createElement('paid', { id: 'not', x: 715, y: 500, w: 36, h: 36 }, { value: 'unpaid', label: 'Not paid' }),
    ],
    groups: [createGroup('svc', { label: 'សេវា / Service', mark: 'dot' })],
    fillOrder: ['name', 'shirt', 'pants', 'svc', 'tel', 'total', 'paid'],
  }
}

/** A phone at the counter: 390 px wide, at 2x when the screens are kept for review. */
async function phone(): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: screenshots ? 2 : 1, locale: 'en-GB' })
  const page = await context.newPage()
  // The print dialog can't be driven headless: count the calls instead.
  await page.addInitScript(() => {
    const counted = window as unknown as { printed: number }
    counted.printed = 0
    window.print = () => {
      counted.printed++
    }
  })
  return page
}

async function shot(page: Page, name: string) {
  if (!screenshots) return
  mkdirSync(screenshots, { recursive: true })
  await page.screenshot({ path: join(screenshots, `${name}.png`) })
}

const printed = (page: Page) => page.evaluate(() => (window as unknown as { printed: number }).printed)

beforeAll(async () => {
  browser = await launchBrowser()
  admin = await newDevice(browser, { width: 1280, height: 800 })
  await admin.goto(`${host}/sign-in`)
  await signIn(admin, accounts.admin.username, accounts.admin.password)
  await admin.waitForURL(`${host}/platform/shops`)
  template = await createCounterTemplate(admin, { name: 'Linda Laundry', design: lindaDesign(), shopNames: [accounts.counterOwner.shop] })
  await createCounterTemplate(admin, { name: 'Beta Wash', design: lindaDesign(), shopNames: [accounts.otherOwner.shop] })
})

afterAll(async () => {
  await browser?.close()
})

describe('the owner\'s counter', () => {
  it('fills, previews, edits, saves once through a lost answer, and reprints the saved slip on its own version', async () => {
    const page = await phone()
    onTestFailed(screenshotOnFailure('orders-counter', [page]))
    await page.goto(`${host}/`)
    await page.waitForURL(/\/sign-in/)
    await signIn(page, accounts.counterOwner.username, accounts.counterOwner.password)
    await page.waitForURL(`${host}/`)
    await expect.poll(() => page.getByText('No orders yet').count()).toBe(1)

    // --- New order: the shop's only slip, every field a row (sheet 01) ---
    await page.getByTestId('new-order').click()
    await page.waitForURL(`${host}/orders/new`)
    await page.getByTestId('field-name').fill('Dara')
    // A count: + twice on one row, typed on another (the − and + sit on the field's row).
    const shirt = page.locator('[data-field="shirt"]')
    await shirt.getByRole('button', { name: /^Add one/ }).click()
    await shirt.getByRole('button', { name: /^Add one/ }).click()
    await page.getByTestId('field-pants').fill('1')
    await page.getByRole('radio', { name: 'Wash + iron' }).check()
    await page.getByTestId('field-phone').fill('012 345 678')
    await page.getByTestId('field-amount').fill('7,000')
    expect(await page.getByRole('radio', { name: 'Not paid' }).isChecked()).toBe(true)
    await page.evaluate(() => window.scrollTo({ top: 0 }))
    await shot(page, '01-intake')

    // The keyboard open (the page shrinks above it, `interactive-widget=resizes-content`): the
    // focused field and Preview are both on screen, Preview not covering the field.
    await page.setViewportSize({ width: 390, height: 508 })
    await page.getByTestId('field-amount').click()
    await page.getByTestId('field-amount').scrollIntoViewIfNeeded()
    const field = (await page.getByTestId('field-amount').boundingBox())!
    const action = (await page.getByTestId('preview').boundingBox())!
    expect(field.y).toBeGreaterThanOrEqual(0)
    expect(action.y + action.height).toBeLessThanOrEqual(508)
    expect(field.y + field.height).toBeLessThanOrEqual(action.y)
    await shot(page, '02-intake-keyboard-open')
    await page.setViewportSize({ width: 390, height: 844 })

    // --- Preview, then Edit: nothing lost, nothing saved ---
    await page.getByTestId('preview').click()
    await page.waitForURL(`${host}/orders/new?step=preview`)
    await expect.poll(() => page.getByTestId('number-placeholder').count()).toBe(1)
    await page.getByTestId('order-slip').locator('image').first().waitFor({ state: 'attached' })
    await shot(page, '03-preview')
    await page.getByTestId('edit').click()
    await page.waitForURL(`${host}/orders/new`)
    expect(await page.getByTestId('field-name').inputValue()).toBe('Dara')
    expect(await page.getByTestId('field-shirt').inputValue()).toBe('2')
    expect(await page.getByTestId('field-pants').inputValue()).toBe('1')
    expect(await page.getByRole('radio', { name: 'Wash + iron' }).isChecked()).toBe(true)
    expect(await page.getByTestId('field-phone').inputValue()).toBe('012 345 678')
    expect(await page.getByTestId('field-amount').inputValue()).toBe('7,000')
    const listed = await page.evaluate(async () => (await (await fetch('/api/shop/orders')).json()).total)
    expect(listed).toBe(0)

    // --- Save & print: the first answer is lost after the server saved; the retry gets the same order ---
    await page.getByTestId('preview').click()
    await page.waitForURL(`${host}/orders/new?step=preview`)
    let firstAnswer: OrderDetail | undefined
    await page.route('**/api/shop/orders', async (route) => {
      if (route.request().method() !== 'POST' || firstAnswer) return route.continue()
      const response = await route.fetch()
      firstAnswer = await response.json() as OrderDetail
      await route.abort('failed')
    })
    await page.getByTestId('save-print').click()
    await expect.poll(() => page.getByTestId('save-error').count()).toBe(1)
    expect(page.url()).toBe(`${host}/orders/new?step=preview`)
    expect(firstAnswer?.number).toBe(1)
    await page.getByTestId('save-print').click()
    await page.waitForURL(new RegExp(`/orders/${firstAnswer!.id}\\?saved=1$`))
    expect(await page.getByTestId('order-number').textContent()).toBe('1')
    await expect.poll(() => printed(page)).toBe(1)
    await page.getByTestId('order-slip').locator('image').first().waitFor({ state: 'attached' })
    await shot(page, '04-saved-slip')
    savedOrder = await page.evaluate(async id => (await fetch(`/api/shop/orders/${id}`)).json(), firstAnswer!.id) as OrderDetail
    expect(savedOrder).toMatchObject({ number: 1, values: { name: 'Dara', shirt: 2, pants: 1, svc: 'wash' }, phone: '+85512345678', amount: 7000, paid: false, templateVersionNumber: 1 })
    expect(await page.evaluate(async () => (await (await fetch('/api/shop/orders')).json()).total)).toBe(1)

    // Two requests at once with one key (a double tap that got past the button): one order.
    const twice = await page.evaluate(async (templateVersionId) => {
      const key = crypto.randomUUID()
      const send = () => fetch('/api/shop/orders', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify({ templateVersionId, values: { shirt: 1 }, phone: '', amount: 3000, paid: true }) })
      const answers = await Promise.all([send(), send()])
      return { statuses: answers.map(answer => answer.status).sort(), ids: await Promise.all(answers.map(async answer => (await answer.json()).id)) }
    }, savedOrder.templateVersionId)
    expect(twice.statuses).toEqual([200, 201])
    expect(twice.ids[0]).toBe(twice.ids[1])
    expect(await page.evaluate(async () => (await (await fetch('/api/shop/orders')).json()).total)).toBe(2)

    // --- The platform publishes the slip again; the saved order reprints on its own version and number ---
    await republishTemplate(admin, { id: template.id, change: design => ({ ...design, elements: design.elements.map(element => (element.type === 'amount' ? { ...element, size: 36 } : element)) }) })
    const now = await page.evaluate(async () => (await (await fetch('/api/shop/templates')).json()) as OrderTemplate[])
    expect(now.map(item => item.versionNumber)).toEqual([2])
    await page.getByTestId('next-order').click()
    await page.waitForURL(`${host}/orders/new`)
    await page.goto(`${host}/`)
    await page.getByRole('link', { name: 'No. 1', exact: true }).click()
    await page.waitForURL(`${host}/orders/${savedOrder.id}`)
    expect(await page.getByTestId('order-number').textContent()).toBe('1')
    expect(await page.getByTestId('order-version').textContent()).toContain('version 1')
    const reopened = await page.evaluate(async id => (await fetch(`/api/shop/orders/${id}`)).json(), savedOrder.id) as OrderDetail
    expect(reopened).toEqual(savedOrder)
    await page.getByTestId('print').click()
    await expect.poll(() => printed(page)).toBe(1)
    await shot(page, '05-reopened-order')
  })

  it('another shop\'s owner can\'t open the order or its artwork: the same 404 as a missing one', async () => {
    expect(savedOrder).toBeDefined()
    const page = await newDevice(browser)
    onTestFailed(screenshotOnFailure('orders-isolation', [page]))
    await page.goto(`${host}/sign-in`)
    await signIn(page, accounts.otherOwner.username, accounts.otherOwner.password)
    await page.waitForURL(`${host}/`)
    await page.goto(`${host}/orders/${savedOrder!.id}`)
    await expect.poll(() => page.getByTestId('order-not-found').count()).toBe(1)
    const imageId = savedOrder!.design.background.imageId
    const statuses = await page.evaluate(async ({ id, imageId }) => Promise.all([
      fetch(`/api/shop/orders/${id}`).then(answer => answer.status),
      fetch(`/api/shop/orders/${id}/images/${imageId}`).then(answer => answer.status),
      fetch('/api/shop/orders').then(async answer => (await answer.json()).total as number),
    ]), { id: savedOrder!.id, imageId })
    expect(statuses).toEqual([404, 404, 0])
  })
})
