import { afterAll, beforeAll, describe, expect, inject, it, onTestFailed } from 'vitest'
import type { Browser } from 'playwright-core'
import { launchBrowser, newDevice, screenshotOnFailure, signIn } from './support/browser'

// The shop's settings are its owner's; its price list is the platform's (D25, D26), from a slip
// template or by hand. The platform admin can't read a shop's data through the shop's API.

const host = inject('e2eHost')
const accounts = inject('e2eAccounts')
let browser: Browser

beforeAll(async () => {
  browser = await launchBrowser()
})

afterAll(async () => {
  await browser?.close()
})

describe('shop settings and the price list', () => {
  it('an owner chooses dollars; the platform adds a price; the owner sees it, read only; the currency is locked', async () => {
    const { username, password } = accounts.priceOwner
    const page = await newDevice(browser)
    onTestFailed(screenshotOnFailure('prices', [page]))
    await page.goto(`${host}/settings`)
    await page.waitForURL(/\/sign-in/)
    await signIn(page, username, password)
    await page.waitForURL(`${host}/settings`)

    // Unsaved changes ask before leaving; staying keeps them.
    await page.getByLabel('Phone').fill('012 345 678')
    const asked: string[] = []
    page.once('dialog', (dialog) => {
      asked.push(dialog.message())
      void dialog.dismiss()
    })
    await page.getByRole('button', { name: 'Open sidebar' }).click()
    await page.getByRole('link', { name: 'More' }).click()
    await expect.poll(() => asked).toEqual(['Leave without saving? Your changes will be lost.'])
    expect(page.url()).toBe(`${host}/settings`)
    expect(await page.getByLabel('Phone').inputValue()).toBe('012 345 678')
    await page.keyboard.press('Escape')

    await page.getByRole('combobox', { name: 'Currency' }).click()
    await page.getByRole('option', { name: 'US dollar ($)' }).click()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => page.getByText('Settings saved.').count()).toBeGreaterThan(0)

    // The platform keeps the shop's price list (D26): a service type, then a price, in dollars.
    const admin = await newDevice(browser, { width: 1280, height: 800 })
    onTestFailed(screenshotOnFailure('prices-admin', [admin]))
    await admin.goto(`${host}/sign-in`)
    await signIn(admin, accounts.admin.username, accounts.admin.password)
    await admin.waitForURL(`${host}/platform/shops`)
    await admin.getByRole('link', { name: new RegExp(accounts.priceOwner.shop) }).click()
    await admin.getByRole('link', { name: 'Open the price list' }).click()
    const prices = /\/platform\/shops\/[^/]+\/prices$/
    await admin.waitForURL(prices)
    await admin.getByRole('link', { name: 'New service type' }).first().click()
    await admin.getByLabel('Name (English)').fill('Wash & iron')
    await admin.getByLabel('Name (Khmer)').fill('បោក និងអ៊ុត')
    await admin.getByRole('button', { name: 'Add' }).click()
    await admin.waitForURL(prices)

    await admin.getByRole('link', { name: 'New price' }).click()
    await admin.getByRole('combobox', { name: 'Service type' }).click()
    await admin.getByRole('option', { name: 'Wash & iron' }).click()
    await admin.getByLabel('Name (English)').fill('Shirt')
    await admin.getByLabel(/Price per piece/).fill('1.5')
    await admin.getByRole('button', { name: 'Add' }).click()
    await admin.waitForURL(prices)
    await expect.poll(() => admin.getByRole('region', { name: 'Wash & iron' }).textContent()).toMatch(/Shirt\s*\$1\.50 \/ piece/)

    // The owner sees the prices, with no way to change them.
    await page.goto(`${host}/prices`)
    await expect.poll(() => page.getByRole('region', { name: 'Wash & iron' }).textContent()).toMatch(/Shirt\s*\$1\.50 \/ piece/)
    expect(await page.getByRole('link', { name: 'New price' }).count()).toBe(0)
    expect((await page.request.post(`${host}/api/shop/service-types`, { data: { nameEn: 'Dry clean', nameKm: '' } })).status()).toBe(403)

    // Prices exist: the currency can no longer change.
    await page.goto(`${host}/settings`)
    await expect.poll(() => page.getByText('Can\'t change once the price list has items.').count()).toBe(1)
    expect(await page.getByRole('combobox', { name: 'Currency' }).isDisabled()).toBe(true)
  })

  it('the platform admin builds a slip template and creates a shop from it (D25)', async () => {
    const page = await newDevice(browser, { width: 1280, height: 800 })
    onTestFailed(screenshotOnFailure('templates', [page]))
    await page.goto(`${host}/sign-in`)
    await signIn(page, accounts.admin.username, accounts.admin.password)
    await page.waitForURL(`${host}/platform/shops`)

    // A new template starts as the usual slip; it needs a name and at least one price.
    await page.getByRole('link', { name: 'Templates' }).click()
    await page.getByRole('link', { name: 'New template' }).first().click()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => page.getByText('Give at least one price').count()).toBe(1)
    await page.getByLabel('Template name').fill('Phnom Penh standard')
    await page.getByLabel('Price of Shirt, Wash & iron').fill('2000')
    // The error leaves as soon as it's fixed, before the next save.
    await expect.poll(() => page.getByText('Give at least one price').count()).toBe(0)
    await page.getByLabel('Price of Mixed clothes, Wash & iron').fill('3500')
    await page.getByLabel('Price of Shirt, Iron only').fill('1,000')
    await page.getByRole('button', { name: 'Remove Silk' }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await page.waitForURL(`${host}/platform/templates`)
    await expect.poll(() => page.getByRole('link', { name: /Phnom Penh standard/ }).textContent()).toMatch(/3 services · 6 items/)

    // The only template is already chosen for a new shop.
    await page.goto(`${host}/platform/shops/new`)
    await page.getByLabel('Shop name').fill('Template Laundry')
    await page.getByLabel('Owner\'s name').fill('Dara')
    await page.getByLabel('Username').fill('e2e_template_owner')
    await page.getByLabel('Temporary password').fill('e2e template pass 1')
    await expect.poll(() => page.getByRole('combobox', { name: 'Template' }).textContent()).toContain('Phnom Penh standard')
    await page.getByRole('button', { name: 'Create shop' }).click()
    await page.waitForURL(/\/platform\/shops\/[^/]+$/)
    await page.getByRole('link', { name: 'Open the price list' }).click()
    await expect.poll(() => page.getByRole('region', { name: 'Wash & iron' }).textContent()).toMatch(/Shirt\s*2,000៛ \/ piece.*Mixed clothes\s*3,500៛ \/ kg/s)
    await expect.poll(() => page.getByRole('region', { name: 'Iron only' }).textContent()).toMatch(/Shirt\s*1,000៛ \/ piece/)
    expect(await page.getByRole('region', { name: 'Dry clean' }).count()).toBe(1)
  })

  it('the platform admin gets 403 from a shop\'s API, over HTTP (spec §5)', async () => {
    const page = await newDevice(browser, { width: 1280, height: 800 })
    await page.goto(`${host}/sign-in`)
    await signIn(page, accounts.admin.username, accounts.admin.password)
    await page.waitForURL(`${host}/platform/shops`)
    for (const path of ['/api/shop/settings', '/api/shop/price-items', '/api/shop/service-types']) {
      const response = await page.request.get(`${host}${path}`)
      expect(response.status(), path).toBe(403)
      expect((await response.json()).code, path).toBe('NO_SHOP')
    }
    // Nor can the platform's shop pages reach a shop's prices.
    await page.goto(`${host}/prices`)
    await page.waitForURL(`${host}/platform/shops`)
  })
})
