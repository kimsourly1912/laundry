import { afterAll, beforeAll, describe, expect, inject, it, onTestFailed } from 'vitest'
import type { Browser } from 'playwright-core'
import { launchBrowser, newDevice, screenshotOnFailure, signIn } from './support/browser'

// M2.1: an owner sets up the shop and its price list; the platform admin can't read a shop's data.

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
  it('an owner chooses dollars, adds a service type and a price; then the currency is locked', async () => {
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
    await page.getByRole('link', { name: 'Prices' }).click()
    await expect.poll(() => asked).toEqual(['Leave without saving? Your changes will be lost.'])
    expect(page.url()).toBe(`${host}/settings`)
    expect(await page.getByLabel('Phone').inputValue()).toBe('012 345 678')
    await page.keyboard.press('Escape')

    await page.getByRole('combobox', { name: 'Currency' }).click()
    await page.getByRole('option', { name: 'US dollar ($)' }).click()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => page.getByText('Settings saved.').count()).toBeGreaterThan(0)

    // A service type, then a price in it, typed in dollars.
    await page.goto(`${host}/prices`)
    await page.getByRole('link', { name: 'New service type' }).first().click()
    await page.getByLabel('Name (English)').fill('Wash & iron')
    await page.getByLabel('Name (Khmer)').fill('បោក និងអ៊ុត')
    await page.getByRole('button', { name: 'Add' }).click()
    await page.waitForURL(`${host}/prices`)

    await page.getByRole('link', { name: 'New price' }).click()
    await page.getByRole('combobox', { name: 'Service type' }).click()
    await page.getByRole('option', { name: 'Wash & iron' }).click()
    await page.getByLabel('Name (English)').fill('Shirt')
    await page.getByLabel(/Price per piece/).fill('1.5')
    await page.getByRole('button', { name: 'Add' }).click()
    await page.waitForURL(`${host}/prices`)
    await expect.poll(() => page.getByRole('region', { name: 'Wash & iron' }).textContent()).toMatch(/Shirt\s*\$1\.50 \/ piece/)

    // Prices exist: the currency can no longer change.
    await page.goto(`${host}/settings`)
    await expect.poll(() => page.getByText('Can\'t change once the price list has items.').count()).toBe(1)
    expect(await page.getByRole('combobox', { name: 'Currency' }).isDisabled()).toBe(true)
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
