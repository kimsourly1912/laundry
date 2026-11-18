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
/** The second order, made by two requests with one key: paid, open. */
let secondOrderId: string | undefined

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

const MENU = 'More'
const printed = (page: Page) => page.evaluate(() => (window as unknown as { printed: number }).printed)

beforeAll(async () => {
  browser = await launchBrowser()
  admin = await newDevice(browser, { width: 1280, height: 800 })
  await admin.goto(`${host}/sign-in`)
  await signIn(admin, accounts.admin.username, accounts.admin.password)
  await admin.waitForURL(`${host}/platform/shops`)
  template = await createCounterTemplate(admin, { name: 'Linda Laundry', design: lindaDesign(), shopNames: [accounts.counterOwner.shop] })
  // The other shop has two slips and no default: New order asks, then remembers (plan §4).
  await createCounterTemplate(admin, { name: 'Beta Wash', design: lindaDesign(), shopNames: [accounts.otherOwner.shop] })
  await createCounterTemplate(admin, { name: 'Beta Wash express', design: lindaDesign(), shopNames: [accounts.otherOwner.shop] })
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
    // The Telegram QR (plan step 4): the e2e server has a bot name and no token, so nothing is sent.
    await expect.poll(() => page.getByTestId('telegram-qr').count()).toBe(1)
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
    secondOrderId = twice.ids[0]
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

    // --- Orders: search by number or phone (sheet 03) ---
    await page.getByRole('button', { name: 'Open sidebar' }).click()
    await page.getByRole('link', { name: 'Orders' }).click()
    await page.waitForURL(`${host}/orders`)
    await expect.poll(() => page.getByTestId('orders-list').getByRole('listitem').count()).toBe(2)
    await shot(page, '09-orders')
    await page.getByTestId('orders-search').fill('#1')
    await page.waitForURL(`${host}/orders?search=%231`)
    await expect.poll(() => page.getByTestId('orders-list').getByRole('listitem').count()).toBe(1)
    await page.getByTestId('orders-search').fill('012 345 678')
    await expect.poll(() => page.getByTestId('orders-list').getByRole('link').allTextContents()).toEqual(['No. 1'])
    await page.getByTestId('orders-search').fill('Dara')
    await expect.poll(() => page.getByTestId('orders-no-match').count()).toBe(1)
  })

  it('marks paid, hands over, and cancels and copies into a new order with a new number (sheets 03, 04, 11)', async () => {
    expect(savedOrder && secondOrderId).toBeTruthy()
    const page = await phone()
    onTestFailed(screenshotOnFailure('orders-actions', [page]))
    await page.goto(`${host}/sign-in`)
    await signIn(page, accounts.counterOwner.username, accounts.counterOwner.password)
    await page.waitForURL(`${host}/`)

    // No. 1: received and unpaid. Start work, Mark ready, Mark paid, then Picked up (paid: no question).
    await page.goto(`${host}/orders/${savedOrder!.id}`)
    expect(await page.getByTestId('pick-up').count()).toBe(0)
    await page.getByTestId('start-work').click()
    await expect.poll(() => page.getByTestId('order-status').textContent()).toBe('In progress')
    await page.getByTestId('mark-ready').click()
    await expect.poll(() => page.getByTestId('order-status').textContent()).toBe('Ready')
    await page.getByTestId('mark-paid').click()
    await expect.poll(() => page.getByTestId('order-paid').textContent()).toBe('Paid')
    expect(await page.getByTestId('cancel').count()).toBe(1)
    await page.goto(`${host}/`)
    await expect.poll(() => page.getByTestId('count-ready').textContent()).toContain('1')
    await shot(page, '10-overview')
    await page.goto(`${host}/orders/${savedOrder!.id}`)
    await page.getByTestId('pick-up').click()
    await expect.poll(() => page.getByTestId('order-status').textContent()).toBe('Collected')
    expect(await page.getByTestId('order-picked-up-at').count()).toBe(1)
    expect(await page.getByTestId('cancel').count() + await page.getByTestId('mark-paid').count() + await page.getByTestId('pick-up').count() + await page.getByTestId('mark-ready').count()).toBe(0)
    await shot(page, '06-collected-order')

    // No. 2: paid, open. Cancel and copy: it is cancelled; a new order opens with its details.
    await page.goto(`${host}/orders/${secondOrderId!}`)
    await page.getByTestId('cancel-copy').click()
    await page.getByTestId('confirm').waitFor()
    // The dialog's opening animation, for the screenshot only.
    await page.waitForTimeout(400)
    await shot(page, '07-cancel-and-copy')
    await page.getByTestId('confirm').click()
    await page.waitForURL(new RegExp(`/orders/new\\?copy=${secondOrderId!}$`))
    await expect.poll(() => page.getByTestId('copied-from').count()).toBe(1)
    expect(await page.getByTestId('field-shirt').inputValue()).toBe('1')
    expect(await page.getByRole('radio', { name: 'Paid', exact: true }).isChecked()).toBe(true)
    await page.getByTestId('preview').click()
    await page.getByTestId('save-only').click()
    await page.waitForURL(/\/orders\/[\da-f-]{36}\?saved=1$/)
    expect(await page.getByTestId('order-number').textContent()).toBe('3')
    const old = await page.evaluate(async id => (await fetch(`/api/shop/orders/${id}`)).json(), secondOrderId!) as OrderDetail
    expect(old).toMatchObject({ number: 2, status: 'cancelled', paid: true })
  })

  it('adds a customer from New order, and finds the order on the customer\'s page (D39)', async () => {
    const page = await phone()
    onTestFailed(screenshotOnFailure('orders-customers', [page]))
    await page.goto(`${host}/sign-in`)
    await signIn(page, accounts.counterOwner.username, accounts.counterOwner.password)
    await page.waitForURL(`${host}/`)
    await page.goto(`${host}/orders/new`)
    await page.getByTestId('customer-picker').click()
    await page.keyboard.type('Sokha')
    await page.getByRole('option', { name: /Add .Sokha. as a new customer/ }).click()
    expect(await page.getByTestId('customer-name').inputValue()).toBe('Sokha')
    await page.getByTestId('customer-phone').fill('099 111 222')
    await page.getByTestId('customer-save').click()
    // The slip's empty phone box takes the customer's phone.
    await expect.poll(() => page.getByTestId('field-phone').inputValue()).toBe('099 111 222')
    await page.locator('[data-field="shirt"]').getByRole('button', { name: /^Add one/ }).click()
    await page.evaluate(() => window.scrollTo({ top: 0 }))
    await page.waitForTimeout(400)
    await shot(page, '11-new-order-customer')
    await page.getByTestId('preview').click()
    await page.getByTestId('save-only').click()
    await page.waitForURL(/\/orders\/[\da-f-]{36}\?saved=1$/)
    const number = await page.getByTestId('order-number').textContent()

    await page.goto(`${host}/more`)
    await page.getByRole('link', { name: 'Customers' }).click()
    await page.waitForURL(`${host}/customers`)
    await page.getByTestId('customers-list').getByRole('link', { name: 'Sokha' }).click()
    await expect.poll(() => page.getByTestId('customer-orders').getByRole('link').allTextContents()).toEqual([`No. ${number}`])
  })

  it('prices an itemized slip from the shop\'s price list, and keeps the lines (D39)', async () => {
    // The platform makes a slip whose counts are linked to price keys.
    const itemized = lindaDesign()
    itemized.elements = itemized.elements.map(element => (element.type === 'number' ? { ...element, priceKey: element.id } : element))
    const slip = await createCounterTemplate(admin, { name: 'Linda itemized', design: itemized, shopNames: [accounts.counterOwner.shop] })

    const page = await phone()
    onTestFailed(screenshotOnFailure('orders-prices', [page]))
    await page.goto(`${host}/sign-in`)
    await signIn(page, accounts.counterOwner.username, accounts.counterOwner.password)
    await page.waitForURL(`${host}/`)
    await page.goto(`${host}/prices`)
    for (const [key, label, price] of [['shirt', 'Shirt, wash + iron', '2000'], ['pants', 'Pants, wash + iron', '3000']] as const) {
      await page.getByTestId('add-price').click()
      await page.getByTestId('price-key').fill(key)
      await page.getByTestId('price-label').fill(label)
      await page.getByTestId('price-amount').fill(price)
      await page.getByTestId('price-save').click()
      await expect.poll(() => page.getByTestId('prices-active').getByText(label).count()).toBe(1)
    }
    await shot(page, '12-prices')

    await page.goto(`${host}/orders/new?template=${slip.id}`)
    const row = (field: string) => page.locator(`[data-field="${field}"]`)
    await row('shirt').getByRole('button', { name: /^Add one/ }).click()
    await row('shirt').getByRole('button', { name: /^Add one/ }).click()
    await row('pants').getByRole('button', { name: /^Add one/ }).click()
    await expect.poll(() => page.getByTestId('field-total').textContent()).toContain('7,000')
    await page.getByTestId('preview').click()
    await page.getByTestId('save-only').click()
    await page.waitForURL(/\/orders\/[\da-f-]{36}\?saved=1$/)
    await expect.poll(() => page.getByTestId('order-items').locator('tbody tr').count()).toBe(2)
    const saved = await page.evaluate(async () => (await fetch(location.pathname.replace('/orders/', '/api/shop/orders/'))).json()) as OrderDetail
    expect(saved).toMatchObject({ amount: 7000, items: [{ key: 'shirt', quantity: 2, lineTotal: 4000 }, { key: 'pants', quantity: 1, lineTotal: 3000 }] })
  })

  it('with two slips and no default, New order asks and remembers; Paper slips moves the default (sheet 05)', async () => {
    const page = await phone()
    onTestFailed(screenshotOnFailure('orders-slips', [page]))
    await page.goto(`${host}/sign-in`)
    await signIn(page, accounts.otherOwner.username, accounts.otherOwner.password)
    await page.waitForURL(`${host}/`)
    await page.getByTestId('new-order').click()
    await page.waitForURL(`${host}/orders/new`)
    // No slip chosen yet: nothing to fill, no Preview.
    expect(await page.getByTestId('preview').count()).toBe(0)
    await page.getByTestId('slip-select').click()
    await page.getByRole('option', { name: 'Beta Wash express' }).click()
    await expect.poll(() => page.getByTestId('preview').count()).toBe(1)
    const defaults = () => page.evaluate(async () => ((await (await fetch('/api/shop/templates')).json()) as OrderTemplate[]).filter(item => item.isDefault).map(item => item.name))
    await expect.poll(defaults).toEqual(['Beta Wash express'])

    // Next time it starts there: no question.
    await page.goto(`${host}/orders/new`)
    await expect.poll(() => page.getByTestId('preview').count()).toBe(1)

    await page.goto(`${host}/more`)
    await page.getByRole('link', { name: 'Paper slips' }).click()
    await page.waitForURL(`${host}/paper-slips`)
    await expect.poll(() => page.getByTestId('paper-slips').getByRole('listitem').count()).toBe(2)
    await page.getByTestId('make-default-Beta Wash').click()
    await expect.poll(defaults).toEqual(['Beta Wash'])
    await page.evaluate(() => window.scrollTo({ top: 0 }))
    await shot(page, '08-paper-slips')
  })

  it('prints at the paper size the platform set on the published version (D39)', async () => {
    await admin.goto(`${host}/platform/templates/${template.id}`)
    await admin.getByRole('button', { name: MENU }).click()
    await admin.getByRole('menuitem', { name: 'Paper size' }).click()
    await admin.getByTestId('paper-width').fill('80')
    await admin.getByTestId('paper-height').fill('52')
    await admin.getByTestId('paper-apply').click()
    await expect.poll(() => admin.getByTestId('save-status').textContent()).toBe('Saved')
    const published = await admin.evaluate(async (id) => {
      const current = await (await fetch(`/api/platform/templates/${id}`)).json() as TemplateDetail
      const answer = await fetch(`/api/platform/templates/${id}/publish`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: current.version }) })
      return answer.json() as Promise<TemplateDetail>
    }, template.id)
    expect(published.design.paper).toEqual({ widthMm: 80, heightMm: 52 })

    const page = await phone()
    onTestFailed(screenshotOnFailure('orders-paper', [page]))
    await page.goto(`${host}/sign-in`)
    await signIn(page, accounts.counterOwner.username, accounts.counterOwner.password)
    await page.waitForURL(`${host}/`)
    const orderId = await page.evaluate(async (templateId) => {
      const slips = await (await fetch('/api/shop/templates')).json() as OrderTemplate[]
      const slip = slips.find(item => item.templateId === templateId)!
      const answer = await fetch('/api/shop/orders', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ templateVersionId: slip.versionId, values: { shirt: 1 }, phone: '', amount: 2000, paid: false }) })
      return (await answer.json()).id as string
    }, template.id)
    await page.goto(`${host}/orders/${orderId}`)
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('style')].some(style => style.textContent?.includes('size: 80mm 52mm')))).toBe(true)
  })

  it('an owner asks for a new design with a photo; the platform finds it in its queue and marks it done (D39)', async () => {
    const page = await phone()
    onTestFailed(screenshotOnFailure('orders-requests', [page, admin]))
    await page.goto(`${host}/sign-in`)
    await signIn(page, accounts.otherOwner.username, accounts.otherOwner.password)
    await page.waitForURL(`${host}/`)
    await page.goto(`${host}/paper-slips`)
    // A photo of the paper slip, drawn in the page.
    const png = Buffer.from(await page.evaluate(async () => {
      const canvas = Object.assign(document.createElement('canvas'), { width: 800, height: 500 })
      const ink = canvas.getContext('2d')!
      ink.fillStyle = '#fffdf5'
      ink.fillRect(0, 0, 800, 500)
      ink.strokeRect(20, 20, 760, 460)
      const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), 'image/png'))
      return [...new Uint8Array(await blob.arrayBuffer())]
    }))
    await page.getByTestId('ask-design').click()
    await page.getByTestId('request-photo').setInputFiles({ name: 'my-slip.png', mimeType: 'image/png', buffer: png })
    await page.getByRole('radio', { name: /Redesign it/ }).check()
    await page.getByTestId('request-notes').fill('Bigger boxes for counts, please')
    await page.waitForTimeout(400)
    await shot(page, '13-ask-for-design')
    await page.getByTestId('request-send').click()
    await expect.poll(() => page.getByTestId('my-requests').getByText('Sent').count()).toBe(1)

    await admin.goto(`${host}/platform/templates`)
    await admin.getByTestId('requests-link').click()
    await admin.waitForURL(`${host}/platform/template-requests`)
    await admin.getByTestId('requests-list').getByText(accounts.otherOwner.shop).click()
    await admin.getByTestId('request-done').click()
    await expect.poll(() => admin.getByTestId('requests-list').count()).toBe(0)
    await page.reload()
    await expect.poll(() => page.getByTestId('my-requests').getByText('Done').count()).toBe(1)
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
    // Nor make a QR for it.
    expect(await page.evaluate(async id => (await fetch(`/api/shop/orders/${id}/telegram`, { method: 'POST' })).status, savedOrder!.id)).toBe(404)
  })
})
