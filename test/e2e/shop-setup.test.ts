import { afterAll, beforeAll, expect, inject, it, onTestFailed } from 'vitest'
import type { Browser, Page } from 'playwright-core'
import type { ShopTemplate, TemplateDetail } from '#shared/contracts/templates'
import { launchBrowser, newDevice, screenshotOnFailure, signIn } from './support/browser'

// City Laundry pilot §2 on a disposable shop: Shops → the shop → Set up paper slip, Publish and
// assign, a failed assignment retried without a second version, and the owner's New order.

const host = inject('e2eHost')
const accounts = inject('e2eAccounts')
let browser: Browser

beforeAll(async () => {
  browser = await launchBrowser()
})

afterAll(async () => {
  await browser?.close()
})

/** The server's view, through the platform's own reads. */
const readTemplate = (page: Page, id: string) => page.evaluate(async id => (await fetch(`/api/platform/templates/${id}`)).json() as Promise<TemplateDetail>, id)
const readShopTemplates = (page: Page, shopId: string) => page.evaluate(async id => (await fetch(`/api/platform/shops/${id}/templates`)).json() as Promise<ShopTemplate[]>, shopId)

it('sets up a paper slip from the shop, publishes and assigns it, and retries a failed assignment', async () => {
  const shopName = accounts.pilotOwner.shop
  const admin = await newDevice(browser, { width: 1440, height: 900 })
  onTestFailed(screenshotOnFailure('shop-setup', [admin]))
  await admin.goto(`${host}/sign-in`)
  await signIn(admin, accounts.admin.username, accounts.admin.password)
  await admin.waitForURL(`${host}/platform/shops`)

  // Shops → the shop → Set up paper slip: the Studio knows the shop.
  await admin.getByRole('link', { name: shopName }).first().click()
  await admin.waitForURL(/\/platform\/shops\/[\da-f-]{36}$/)
  const shopId = admin.url().split('/').at(-1)!
  await admin.getByTestId('set-up-slip').click()
  await admin.waitForURL(`**/platform/templates/new?shop=${shopId}`)
  await expect.poll(() => admin.getByTestId('setup-shop').textContent()).toBe(`For ${shopName}`)

  // A reviewed draft: the By weight preset, saved; the shop rides along to the draft's page.
  await admin.getByRole('button', { name: 'Use a preset' }).click()
  await admin.getByTestId('preset-byWeight').click()
  await admin.getByLabel('Template name').fill('Pilot fixture slip')
  await admin.getByRole('button', { name: 'Save draft' }).click()
  await admin.waitForURL(new RegExp(`/platform/templates/[\\da-f-]{36}\\?shop=${shopId}$`))
  const templateId = new URL(admin.url()).pathname.split('/').at(-1)!
  await expect.poll(() => admin.getByTestId('setup-shop').textContent()).toBe(`For ${shopName}`)
  const publish = admin.getByTestId('html-publish')
  await expect.poll(() => publish.textContent()).toBe('Publish and assign')

  // The attach fails once: the version stays published, and no success is shown.
  let attaches = 0
  await admin.route(`**/api/platform/templates/${templateId}/shops`, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    attaches++
    if (attaches === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ statusCode: 503, message: 'Unavailable' }) })
    return route.fallback()
  })
  await publish.click()
  const dialog = admin.getByRole('dialog')
  await expect.poll(() => dialog.getByRole('heading').first().textContent()).toBe(`Publish version 1 and assign it to ${shopName}?`)
  expect(await admin.getByTestId('assign-target').textContent()).toContain(`${shopName} will use this slip`)
  await admin.getByTestId('html-publish-confirm').click()
  await admin.getByTestId('assign-failed').waitFor()
  expect(await admin.getByTestId('assign-failed').textContent()).toContain(`Version 1 is published, but it isn’t assigned to ${shopName} yet.`)
  expect(await admin.getByText('is published and assigned').count()).toBe(0)
  expect(await readTemplate(admin, templateId)).toMatchObject({ status: 'published', latestVersion: 1 })
  expect(await readShopTemplates(admin, shopId)).toEqual([])

  // Retry assignment: the same version, attached once.
  const retry = admin.getByTestId('html-publish-confirm')
  expect(await retry.textContent()).toBe('Retry assignment')
  await retry.click()
  await expect.poll(() => admin.getByText(`Version 1 is published and assigned to ${shopName}.`).count()).toBeGreaterThan(0)
  expect(attaches).toBe(2)
  expect(await readTemplate(admin, templateId)).toMatchObject({ latestVersion: 1, hasUnpublishedChanges: false })
  expect((await readShopTemplates(admin, shopId)).map(item => item.templateId)).toEqual([templateId])
  await expect.poll(() => publish.textContent()).toBe(`Assigned to ${shopName}`)
  expect(await publish.isDisabled()).toBe(true)

  // Published but not attached after a reload (detached here): Assign to the shop, no new version.
  await admin.evaluate(async ({ templateId, shopId }) => {
    await fetch(`/api/platform/templates/${templateId}/shops/${shopId}`, { method: 'DELETE' })
  }, { templateId, shopId })
  await admin.reload()
  await expect.poll(() => publish.textContent()).toBe(`Assign to ${shopName}`)
  await publish.click()
  await expect.poll(() => dialog.getByRole('heading').first().textContent()).toBe(`Assign version 1 to ${shopName}?`)
  await admin.getByTestId('html-publish-confirm').click()
  await expect.poll(() => admin.getByText(`Version 1 is published and assigned to ${shopName}.`).count()).toBeGreaterThan(0)
  expect(await readTemplate(admin, templateId)).toMatchObject({ latestVersion: 1 })
  expect((await readShopTemplates(admin, shopId)).map(item => item.templateId)).toEqual([templateId])

  // The shop's page lists it.
  await admin.goto(`${host}/platform/shops/${shopId}`)
  await expect.poll(() => admin.getByTestId('shop-templates').textContent()).toContain('Pilot fixture slip')

  // The owner: New order opens the assigned slip directly (the only one, plan §4).
  const owner = await newDevice(browser)
  onTestFailed(screenshotOnFailure('shop-setup-owner', [owner]))
  await owner.goto(`${host}/sign-in`)
  await signIn(owner, accounts.pilotOwner.username, accounts.pilotOwner.password)
  await owner.waitForURL(`${host}/`)
  await owner.goto(`${host}/orders/new`)
  await expect.poll(() => owner.locator('[data-field="weight_kg"]').count()).toBe(1)
  expect(await owner.getByTestId('no-slip').count()).toBe(0)
  expect(await owner.getByTestId('slip-select').count()).toBe(0)
})

it('takes a paper-slip order on a phone: the slip\'s fields, Save order from the form, Preview keeps the values (pilot §3)', async () => {
  const owner = await newDevice(browser)
  onTestFailed(screenshotOnFailure('shop-setup-counter', [owner]))
  await owner.goto(`${host}/sign-in`)
  await signIn(owner, accounts.pilotOwner.username, accounts.pilotOwner.password)
  await owner.waitForURL(`${host}/`)
  const posts: string[] = []
  owner.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/shop/orders') posts.push(request.headers()['idempotency-key'] ?? '')
  })
  await owner.goto(`${host}/orders/new`)

  // The slip's own fields, in its fill order; the customer and the pickup day wait behind More details.
  await owner.locator('[data-field="weight_kg"]').waitFor()
  const order = await owner.locator('[data-field]').evaluateAll(rows => rows.map(row => row.getAttribute('data-field')))
  expect(order).toEqual(['phone', 'weight_kg', 'wash_iron', 'dry_clean', 'iron_only', 'total', 'paid'])
  expect(await owner.getByTestId('customer-picker').count()).toBe(0)
  expect(await owner.getByTestId('due-date').isVisible()).toBe(false)
  const save = owner.getByTestId('save-order')
  expect(await save.textContent()).toBe('Save order')

  // Save order checks the form first: the required weight, and nothing is sent.
  await save.click()
  await expect.poll(() => owner.locator('[data-field="weight_kg"]').textContent()).toContain('Fill this in')
  expect(posts).toEqual([])

  // A typical order: the weight, a service tick and the total typed by hand.
  await owner.getByTestId('field-weight_kg').fill('3.5')
  await owner.getByTestId('field-wash_iron').click()
  await owner.getByTestId('field-amount').fill('7,000')

  // Preview, then back: everything as typed.
  await owner.getByTestId('preview').click()
  await owner.waitForURL(`${host}/orders/new?step=preview`)
  await owner.getByTestId('edit').click()
  await owner.waitForURL(`${host}/orders/new`)
  expect(await owner.getByTestId('field-weight_kg').inputValue()).toBe('3.5')
  expect(await owner.getByTestId('field-wash_iron').getAttribute('aria-checked')).toBe('true')
  expect(await owner.getByTestId('field-amount').inputValue()).toBe('7,000')

  // A double tap on Save order makes one order, then the existing order page.
  await save.dblclick()
  await owner.waitForURL(/\/orders\/[\da-f-]{36}\?saved=1$/)
  await expect.poll(() => owner.getByTestId('order-number').textContent()).toContain('1')
  expect(new Set(posts).size).toBe(1)
  const orders = await owner.evaluate(async () => (await (await fetch('/api/shop/orders')).json()) as { items: { number: number, amount: number | null }[] })
  expect(orders.items.map(item => [item.number, item.amount])).toEqual([[1, 7000]])
  const saved = await owner.evaluate(async () => (await fetch(location.pathname.replace('/orders/', '/api/shop/orders/'))).json())
  expect(saved).toMatchObject({ amount: 7000, values: { weight_kg: 3.5, wash_iron: true }, templateVersionNumber: 1 })
})
