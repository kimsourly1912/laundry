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
      createElement('number', { id: 'weight', x: 360, y: 380, w: 120, h: 44 }, { label: 'Weight', unit: 'kg', min: 0.01, max: 100, decimals: 2 }),
      createElement('option', { id: 'wash', x: 550, y: 258, w: 36, h: 36 }, { group: 'svc', label: 'Wash + iron' }),
      createElement('option', { id: 'iron', x: 550, y: 328, w: 36, h: 36 }, { group: 'svc', label: 'Iron only' }),
      createElement('phone', { id: 'tel', x: 170, y: 415, w: 330, h: 44 }, { size: 26 }),
      createElement('amount', { id: 'total', x: 170, y: 495, w: 330, h: 44 }, { label: 'សរុប / Total', bold: true }),
      createElement('paid', { id: 'yes', x: 595, y: 500, w: 36, h: 36 }, { value: 'paid', label: 'Paid' }),
      createElement('paid', { id: 'not', x: 715, y: 500, w: 36, h: 36 }, { value: 'unpaid', label: 'Not paid' }),
    ],
    groups: [createGroup('svc', { label: 'សេវា / Service', mark: 'dot' })],
    fillOrder: ['name', 'shirt', 'pants', 'weight', 'svc', 'tel', 'total', 'paid'],
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

    // The selected slip is visible, optional details are closed, and the required count takes focus.
    await page.getByTestId('new-order').click()
    await page.waitForURL(`${host}/orders/new`)
    expect(await page.getByTestId('paper-slip-name').textContent()).toBe('Linda Laundry')
    expect(await page.getByTestId('more-details').getAttribute('aria-expanded')).toBe('false')
    const saveOrder = page.getByTestId('save-order')
    await saveOrder.focus()
    await page.keyboard.press('Enter')
    const shirtInput = page.getByTestId('field-shirt')
    await expect.poll(() => shirtInput.evaluate(input => input === document.activeElement)).toBe(true)
    expect(await shirtInput.getAttribute('aria-invalid')).toBe('true')
    expect(await shirtInput.getAttribute('inputmode')).toBe('numeric')
    await page.getByTestId('field-name').fill('Dara')
    // A count: + twice on one row, typed on another (the − and + sit on the field's row).
    const shirt = page.locator('[data-field="shirt"]')
    await shirt.getByRole('button', { name: /^Add one/ }).click()
    await shirt.getByRole('button', { name: /^Add one/ }).click()
    await page.getByTestId('field-pants').fill('1')
    const weight = page.getByRole('spinbutton', { name: 'Weight (kg)' })
    expect(await weight.getAttribute('inputmode')).toBe('decimal')
    await weight.fill('2,55')
    await page.getByRole('radio', { name: 'Wash + iron' }).check()
    await page.getByTestId('field-phone').fill('012 345 678')
    await page.getByTestId('field-amount').fill('7,000')
    expect(await page.getByRole('radio', { name: 'Not paid' }).isChecked()).toBe(true)
    await page.evaluate(() => window.scrollTo({ top: 0 }))
    await shot(page, '01-intake')

    for (const [width, height] of [[320, 640], [390, 844], [768, 900], [1024, 768], [1440, 900], [844, 390]] as const) {
      await page.setViewportSize({ width, height })
      expect(await page.getByTestId('field-amount').evaluate((input) => {
        const body = input.closest('[data-slot="body"]')!
        return body.scrollWidth <= body.clientWidth && document.documentElement.scrollWidth <= window.innerWidth
      })).toBe(true)
      const bounds = (await saveOrder.boundingBox())!
      expect(bounds.x).toBeGreaterThanOrEqual(0)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(height)
      if (width === 1440) await shot(page, '01-intake-wide')
    }

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
    await expect.poll(() => page.getByTestId('preview').evaluate(button => button === document.activeElement)).toBe(true)
    expect(await page.getByTestId('field-name').inputValue()).toBe('Dara')
    expect(await page.getByTestId('field-shirt').inputValue()).toBe('2')
    expect(await page.getByTestId('field-pants').inputValue()).toBe('1')
    expect(await weight.inputValue()).toBe('2.55')
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
    expect(savedOrder).toMatchObject({ number: 1, values: { name: 'Dara', shirt: 2, pants: 1, weight: 2.55, svc: 'wash' }, phone: '+85512345678', amount: 7000, paid: false, templateVersionNumber: 1 })
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
    await page.getByRole('link', { name: 'Back' }).click()
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
    await page.waitForURL(`${host}/orders/new?copy=${secondOrderId!}&step=preview`)
    await page.getByTestId('save-only').click()
    await page.waitForURL(/\/orders\/[\da-f-]{36}\?saved=1$/)
    expect(await page.getByTestId('order-number').textContent()).toBe('3')
    const old = await page.evaluate(async id => (await fetch(`/api/shop/orders/${id}`)).json(), secondOrderId!) as OrderDetail
    expect(old).toMatchObject({ number: 2, status: 'cancelled', paid: true })
  })

  it('adds a customer from New order; the order page names them (D39)', async () => {
    const page = await phone()
    onTestFailed(screenshotOnFailure('orders-customers', [page]))
    await page.goto(`${host}/sign-in`)
    await signIn(page, accounts.counterOwner.username, accounts.counterOwner.password)
    await page.waitForURL(`${host}/`)
    await page.goto(`${host}/orders/new`)
    // A manual-total slip keeps the customer behind More details (pilot plan §3).
    await page.getByTestId('more-details').click()
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
    const dueDate = await page.getByTestId('due-date').getAttribute('min')
    await page.getByTestId('due-date').fill(dueDate!)
    await page.getByTestId('more-details').click()
    expect(await page.getByTestId('more-details').textContent()).toContain('Sokha')
    await page.getByTestId('save-order').click()
    await page.waitForURL(/\/orders\/[\da-f-]{36}\?saved=1$/)
    const saved = await page.evaluate(async () => (await fetch(location.pathname.replace('/orders/', '/api/shop/orders/'))).json()) as OrderDetail
    expect(saved).toMatchObject({ dueDate, customerName: 'Sokha' })
    await expect.poll(() => page.getByText('Sokha', { exact: true }).count()).toBeGreaterThan(0)
    // No customer pages (D44): the order names the customer as plain text, and More has no Customers.
    expect(await page.getByRole('link', { name: 'Sokha' }).count()).toBe(0)
    await page.goto(`${host}/more`)
    await page.getByRole('link', { name: 'Paper slips' }).waitFor()
    expect(await page.getByRole('link', { name: 'Customers' }).count()).toBe(0)
  })

  it('an HTML slip: started from the sample on a phone, an AI answer imported, published, and filled by the owner (D39)', async () => {
    // The platform, on a phone: the HTML studio's tabs.
    const studio = await phone()
    onTestFailed(screenshotOnFailure('orders-html', [studio]))
    await studio.goto(`${host}/sign-in`)
    await signIn(studio, accounts.admin.username, accounts.admin.password)
    await studio.waitForURL(`${host}/platform/shops`)
    await studio.goto(`${host}/platform/templates`)
    await studio.getByRole('link', { name: 'Create template' }).first().click()
    await studio.waitForURL('**/platform/templates/new')
    await studio.getByRole('button', { name: 'Use a preset' }).click()
    await studio.getByTestId('preset-byItem').click()
    await studio.getByLabel('Template name').fill('Linda HTML')
    await studio.getByRole('button', { name: 'Save draft' }).click()
    await studio.waitForURL(/\/platform\/templates\/[\da-f-]{36}$/)
    const templateId = studio.url().split('/').at(-1)!
    await expect.poll(() => studio.getByTestId('html-ok').count()).toBe(1)

    // A bad answer says where; a good one replaces the markup.
    await studio.getByTestId('open-ai').click()
    await studio.getByTestId('answer-text').fill('{ "version": 2, "name": "x", "html": "<div></div>" }')
    await studio.getByTestId('answer-import').click()
    await expect.poll(() => studio.getByTestId('answer-problems').textContent()).toContain('version must be 1')
    const html = '<div class="flex flex-col w-full h-full p-6 gap-2"><div class="flex justify-between"><span class="text-[36px] font-bold">{{shop.name}}</span><span class="text-[30px]">No. {{order.number}}</span></div><span>{{customer.name}}</span><div class="flex flex-col border-t border-b border-gray-400 py-2">Shirt {{fields.shirt_count}}</div><div class="flex justify-between items-end"><span class="text-[30px] font-bold">{{order.total}}</span><div class="flex">{{order.qrCode}}</div></div></div>'
    await studio.getByTestId('answer-text').fill(JSON.stringify({ version: 1, name: 'Compact', html, reviewNotes: ['Check the total\'s size'] }))
    await studio.getByTestId('answer-import').click()
    await expect.poll(() => studio.getByTestId('html-source').locator('.cm-content').textContent()).toBe(html)

    // The By item preset's counts are quantities; staff type the total (D44).
    await studio.getByTestId('open-fields').click()
    await expect.poll(() => studio.getByTestId('field-shirt_count').count()).toBe(1)
    expect(await studio.getByTestId('pricing-toggle').count()).toBe(0)
    await studio.getByRole('button', { name: 'Close sidebar' }).click()
    await studio.getByRole('tab', { name: 'Preview' }).click()
    await expect.poll(() => studio.getByTestId('html-preview').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth)).toBe(800)
    await expect.poll(() => studio.getByTestId('save-status').textContent()).toBe('Saved')
    await shot(studio, '14-html-studio-preview')
    await studio.getByTestId('html-publish').click()
    await studio.getByTestId('html-publish-confirm').click()
    await expect.poll(() => studio.getByText('Version 1 is published.').count()).toBeGreaterThan(0)
    await studio.evaluate(async ({ templateId, shopName }) => {
      const shops = await (await fetch('/api/platform/shops?pageSize=100')).json() as { items: { id: string, name: string }[] }
      const shop = shops.items.find(item => item.name === shopName)!
      await fetch(`/api/platform/templates/${templateId}/shops`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shopId: shop.id }) })
    }, { templateId, shopName: accounts.counterOwner.shop })

    // The owner fills it, types the total as on paper, previews the server's drawing, and saves.
    const page = await phone()
    onTestFailed(screenshotOnFailure('orders-html-owner', [page]))
    await page.goto(`${host}/sign-in`)
    await signIn(page, accounts.counterOwner.username, accounts.counterOwner.password)
    await page.waitForURL(`${host}/`)
    await page.goto(`${host}/orders/new?template=${templateId}`)
    const shirt = page.locator('[data-field="shirt_count"]')
    await shirt.getByRole('button', { name: /^Add one/ }).click()
    await shirt.getByRole('button', { name: /^Add one/ }).click()
    await page.getByTestId('field-amount').fill('4,000')
    await page.getByTestId('preview').click()
    await expect.poll(() => page.getByTestId('server-slip').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth)).toBe(800)
    await shot(page, '15-html-preview')
    await page.getByTestId('save-only').click()
    await page.waitForURL(/\/orders\/[\da-f-]{36}\?saved=1$/)
    await expect.poll(() => page.getByTestId('server-slip').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth)).toBe(800)
    const saved = await page.evaluate(async () => (await fetch(location.pathname.replace('/orders/', '/api/shop/orders/'))).json()) as OrderDetail
    expect(saved).toMatchObject({ amount: 4000, values: { shirt_count: 2 } })
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
