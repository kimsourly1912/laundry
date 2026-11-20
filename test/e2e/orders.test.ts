import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, inject, it, onTestFailed } from 'vitest'
import type { Browser, Page } from 'playwright-core'
import type { OrderDetail } from '#shared/contracts/orders'
import { blankDesign } from '#shared/contracts/slip-design'
import type { SlipDesign } from '#shared/contracts/slip-design'
import type { TemplateDetail } from '#shared/contracts/templates'
import { createElement, createGroup } from '#shared/slip/elements'
import { createCounterTemplate, republishTemplate } from './support/templates'
import { launchBrowser, newDevice, screenshotOnFailure, signIn } from './support/browser'

const host = inject('e2eHost')
const accounts = inject('e2eAccounts')
const screenshots = process.env.E2E_SCREENSHOTS
let browser: Browser
let admin: Page
let template: TemplateDetail

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

async function shot(page: Page, name: string) {
  if (!screenshots) return
  mkdirSync(screenshots, { recursive: true })
  await page.screenshot({ path: join(screenshots, `${name}.png`) })
}

beforeAll(async () => {
  browser = await launchBrowser()
  admin = await newDevice(browser, { width: 1280, height: 800 })
  await admin.goto(`${host}/sign-in`)
  await signIn(admin, accounts.admin.username, accounts.admin.password)
  await admin.waitForURL(`${host}/platform/shops`)
  template = await createCounterTemplate(admin, { name: 'Linda Laundry', design: lindaDesign(), shopNames: [accounts.counterOwner.shop] })
})

afterAll(async () => {
  await browser?.close()
})

it('fills the artwork from home, saves once through a lost response, and reopens the exact saved slip', async () => {
  const page = await newDevice(browser)
  onTestFailed(screenshotOnFailure('saved-slip', [page]))
  await page.goto(`${host}/sign-in`)
  await signIn(page, accounts.counterOwner.username, accounts.counterOwner.password)
  await page.waitForURL(`${host}/`)
  await page.getByTestId('fill-box-shirt').waitFor()
  await shot(page, 'fill-slip')
  const save = page.getByTestId('save-slip')
  await save.click()
  const shirt = page.getByTestId('field-shirt')
  await expect.poll(() => shirt.evaluate(input => input === document.activeElement)).toBe(true)
  expect(await shirt.getAttribute('aria-invalid')).toBe('true')
  await shirt.fill('3')
  await page.getByTestId('fill-box-name').click()
  await page.getByTestId('field-name').fill('Dara')
  await page.getByTestId('fill-box-tel').click()
  await page.getByTestId('field-phone').fill('012 345 678')
  await page.getByTestId('fill-box-total').click()
  await page.getByTestId('field-amount').fill('7,000')
  await page.getByTestId('fill-box-shirt').click()
  expect(await shirt.inputValue()).toBe('3')
  await shot(page, 'fill-slip-edit')

  const keys: string[] = []
  await page.route('**/api/shop/orders', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    keys.push(route.request().headers()['idempotency-key'] ?? '')
    const response = await route.fetch()
    if (keys.length === 1) {
      expect(response.status()).toBe(201)
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
    }
    expect(response.status()).toBe(200)
    return route.fulfill({ response })
  })
  await save.click()
  await page.getByTestId('save-error').waitFor()
  expect(await shirt.inputValue()).toBe('3')
  await save.click()
  await page.waitForURL(/\/orders\/[\da-f-]{36}$/)
  expect(keys).toHaveLength(2)
  expect(new Set(keys).size).toBe(1)
  const detailUrl = page.url()
  const id = detailUrl.split('/').at(-1)!
  await page.getByTestId('server-slip').waitFor()
  await page.getByTestId('telegram-qr').waitFor()
  await shot(page, 'saved-slip')
  expect(await page.getByRole('button', { name: /start work|mark ready|mark paid|picked up|print/i }).count()).toBe(0)
  const saved = await page.evaluate(async id => (await fetch(`/api/shop/orders/${id}`)).json() as Promise<OrderDetail>, id)
  expect(saved).toMatchObject({ number: 1, amount: 7000, values: { name: 'Dara', shirt: 3 }, templateVersionNumber: 1 })
  const artwork = () => page.evaluate(async id => (await fetch(`/api/shop/orders/${id}/slip`)).text(), id)
  const original = await artwork()

  await republishTemplate(admin, { id: template.id, change: design => ({ ...design, elements: design.elements.map(item => item.type === 'number' ? { ...item, x: item.x + 40 } : item) }) })
  await page.getByTestId('next-slip').click()
  await page.waitForURL(`${host}/`)
  await page.getByTestId('fill-box-shirt').click()
  expect(await shirt.inputValue()).toBe('')
  await page.getByRole('link', { name: 'Saved slips' }).click()
  await expect.poll(() => page.getByTestId('orders-list').getByRole('listitem').count()).toBe(1)
  await page.getByTestId('orders-search').fill('#1')
  await expect.poll(() => page.getByTestId('orders-list').getByRole('listitem').count()).toBe(1)
  await page.getByTestId('orders-list').getByRole('link', { name: 'No. 1' }).click()
  await page.waitForURL(detailUrl)
  await page.getByTestId('telegram-qr').waitFor()
  expect(await artwork()).toBe(original)

  const other = await newDevice(browser)
  await other.goto(`${host}/sign-in`)
  await signIn(other, accounts.otherOwner.username, accounts.otherOwner.password)
  await other.waitForURL(`${host}/`)
  expect(await other.evaluate(async id => (await fetch(`/api/shop/orders/${id}/slip`)).status, id)).toBe(404)
  expect(await other.evaluate(async id => (await fetch(`/api/shop/orders/${id}/telegram`, { method: 'POST' })).status, id)).toBe(404)
})
