import { afterAll, beforeAll, describe, expect, inject, it, onTestFailed } from 'vitest'
import type { Browser } from 'playwright-core'
import { launchBrowser, newDevice, screenshotOnFailure, signIn } from './support/browser'

// The shop's settings are its owner's (docs/standards/forms.md → Unsaved changes). The platform
// admin can't read a shop's data through the shop's API (spec §5).

const host = inject('e2eHost')
const accounts = inject('e2eAccounts')
let browser: Browser

beforeAll(async () => {
  browser = await launchBrowser()
})

afterAll(async () => {
  await browser?.close()
})

describe('shop settings', () => {
  it('unsaved changes ask before leaving and staying keeps them; a save moves the baseline', async () => {
    const { username, password } = accounts.settingsOwner
    const page = await newDevice(browser)
    onTestFailed(screenshotOnFailure('settings', [page]))
    await page.goto(`${host}/settings`)
    await page.waitForURL(/\/sign-in/)
    await signIn(page, username, password)
    await page.waitForURL(`${host}/settings`)

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

    // Orders keep a copy of the shop's details (D33): the currency changes freely.
    await page.getByRole('combobox', { name: 'Currency' }).click()
    await page.getByRole('option', { name: 'US dollar ($)' }).click()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => page.getByText('Settings saved.').count()).toBeGreaterThan(0)

    // Saved: leaving asks nothing.
    page.once('dialog', dialog => asked.push(dialog.message()))
    await page.getByRole('button', { name: 'Open sidebar' }).click()
    await page.getByRole('link', { name: 'More' }).click()
    await page.waitForURL(`${host}/more`)
    expect(asked).toHaveLength(1)
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
    await page.goto(`${host}/settings`)
    await page.waitForURL(`${host}/platform/shops`)
  })
})
