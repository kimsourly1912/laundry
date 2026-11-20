import { afterAll, beforeAll, describe, expect, inject, it, onTestFailed } from 'vitest'
import type { Browser } from 'playwright-core'
import { launchBrowser, newDevice, screenshotOnFailure, signIn } from './support/browser'

// The shop's details (what its slips print) are the platform's to keep (D44); the owner reads them
// only (docs/standards/forms.md → Unsaved changes). The platform admin can't read a shop's data
// through the shop's API (spec §5).

const host = inject('e2eHost')
const accounts = inject('e2eAccounts')
let browser: Browser

beforeAll(async () => {
  browser = await launchBrowser()
})

afterAll(async () => {
  await browser?.close()
})

describe('shop details', () => {
  it('the platform keeps them: unsaved changes ask before leaving, a save moves the baseline, the owner reads them', async () => {
    const admin = await newDevice(browser, { width: 1280, height: 800 })
    onTestFailed(screenshotOnFailure('shop-details', [admin]))
    await admin.goto(`${host}/sign-in`)
    await signIn(admin, accounts.admin.username, accounts.admin.password)
    await admin.waitForURL(`${host}/platform/shops`)
    await admin.getByRole('link', { name: accounts.settingsOwner.shop }).click()
    await admin.waitForURL(/\/platform\/shops\/[^/]+$/)
    const shopUrl = admin.url()
    const details = admin.getByTestId('shop-details')

    await details.getByLabel('Phone').fill('012 345 678')
    const asked: string[] = []
    admin.once('dialog', (dialog) => {
      asked.push(dialog.message())
      void dialog.dismiss()
    })
    await admin.getByLabel('Shops', { exact: true }).click()
    await expect.poll(() => asked).toEqual(['Leave without saving? Your changes will be lost.'])
    expect(admin.url()).toBe(shopUrl)
    expect(await details.getByLabel('Phone').inputValue()).toBe('012 345 678')

    // Orders keep a copy of the shop's details (D33): the currency changes freely.
    await details.getByRole('combobox', { name: 'Currency' }).click()
    await admin.getByRole('option', { name: 'US dollar ($)' }).click()
    await details.getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => admin.getByText('Shop details saved.').count()).toBeGreaterThan(0)

    // Saved: leaving asks nothing.
    admin.once('dialog', dialog => asked.push(dialog.message()))
    await admin.getByLabel('Shops', { exact: true }).click()
    await admin.waitForURL(`${host}/platform/shops`)
    expect(asked).toHaveLength(1)

    // The owner's app reads the new details, and has no way to change them.
    const owner = await newDevice(browser)
    await owner.goto(`${host}/sign-in`)
    await signIn(owner, accounts.settingsOwner.username, accounts.settingsOwner.password)
    await owner.waitForURL(`${host}/`)
    const read = await owner.request.get(`${host}/api/shop/settings`)
    expect(await read.json()).toMatchObject({ phone: '012 345 678', currency: 'USD' })
    const write = await owner.request.patch(`${host}/api/shop/settings`, { data: { version: 2, name: 'Mine now', phone: null, address: null, currency: 'KHR' }, headers: { origin: host } })
    expect(write.status()).toBe(404)
    await owner.goto(`${host}/more`)
    await expect.poll(() => owner.getByRole('link', { name: 'Shop settings' }).count()).toBe(0)
  })

  it('the platform admin gets 403 from a shop\'s API, over HTTP (spec §5)', async () => {
    const page = await newDevice(browser, { width: 1280, height: 800 })
    await page.goto(`${host}/sign-in`)
    await signIn(page, accounts.admin.username, accounts.admin.password)
    await page.waitForURL(`${host}/platform/shops`)
    const response = await page.request.get(`${host}/api/shop/settings`)
    expect(response.status()).toBe(403)
    expect((await response.json()).code).toBe('NO_SHOP')
    // Nor do the shop's pages open for the platform.
    await page.goto(`${host}/more`)
    await page.waitForURL(`${host}/platform/shops`)
  })
})
