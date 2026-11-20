import { afterAll, beforeAll, describe, expect, inject, it, onTestFailed } from 'vitest'
import type { Browser } from 'playwright-core'
import { launchBrowser, newDevice, screenshotOnFailure, signIn } from './support/browser'

// Spec §18 M1.6: sign in → forced change → shop home; platform admin → shops list; revoked
// session → sign-in. Against a production build and a seeded database (support/global-setup.ts).

const host = inject('e2eHost')
const accounts = inject('e2eAccounts')
let browser: Browser

beforeAll(async () => {
  browser = await launchBrowser()
})

afterAll(async () => {
  await browser?.close()
})

describe('the app shell', () => {
  it('an owner on a temporary password signs in, must change it, then lands on the shop\'s home', async () => {
    const { username, password, shop } = accounts.newOwner
    const page = await newDevice(browser)
    onTestFailed(screenshotOnFailure('forced-change', [page]))
    await page.goto(`${host}/`)
    await page.waitForURL(`${host}/sign-in`)

    // A wrong password is refused in place.
    await signIn(page, username, 'not the password')
    await expect.poll(() => page.getByRole('alert').textContent()).toContain('Wrong username or password.')

    // Phone keyboards capitalize: the username still matches.
    await signIn(page, ` ${username.toUpperCase()} `, password)
    await page.waitForURL(/\/change-password/)
    // Nothing else opens until the password is changed.
    await page.goto(`${host}/account`)
    await page.waitForURL(/\/change-password/)

    await page.getByLabel('Current password').fill(password)
    await page.getByLabel('New password', { exact: true }).fill('my own new password 1')
    await page.getByLabel('New password again').fill('my own new password 1')
    await page.getByRole('button', { name: 'Change password' }).click()

    // Onward to the page asked for, then the shop's home.
    await page.waitForURL(`${host}/account`)
    await page.goto(`${host}/`)
    await expect.poll(() => page.getByRole('heading', { level: 1 }).textContent()).toBe(shop)
    // An owner never reaches the platform's pages.
    await page.goto(`${host}/platform/shops`)
    await page.waitForURL(`${host}/`)
  })

  it('the platform admin lands on the shops list, sees every shop, and never a shop\'s pages', async () => {
    const page = await newDevice(browser, { width: 1280, height: 800 })
    await page.goto(`${host}/platform/shops`)
    await page.waitForURL(/\/sign-in\?redirect=/)
    await signIn(page, accounts.admin.username, accounts.admin.password)

    // Back to the page asked for.
    await page.waitForURL(`${host}/platform/shops`)
    await expect.poll(() => page.getByRole('link', { name: new RegExp(accounts.owner.shop) }).count()).toBe(1)
    await expect.poll(() => page.getByRole('link', { name: new RegExp(accounts.newOwner.shop) }).count()).toBe(1)

    // A shop's home sends the admin back to the platform.
    await page.goto(`${host}/`)
    await page.waitForURL(`${host}/platform/shops`)
  })

  it('a session revoked on another device goes to sign-in on its next request, with nothing left on screen', async () => {
    const { username, password, shop } = accounts.owner
    const phone = await newDevice(browser)
    await phone.goto(`${host}/sign-in`)
    await signIn(phone, username, password)
    await phone.waitForURL(`${host}/`)
    await expect.poll(() => phone.getByRole('heading', { level: 1 }).textContent()).toContain(shop)

    // The platform admin signs the owner out everywhere (the owner lost this phone).
    const admin = await newDevice(browser, { width: 1280, height: 800 })
    onTestFailed(screenshotOnFailure('revoked', [phone, admin]))
    await admin.goto(`${host}/sign-in`)
    await signIn(admin, accounts.admin.username, accounts.admin.password)
    await admin.waitForURL(`${host}/platform/shops`)
    await admin.getByRole('link', { name: new RegExp(shop) }).click()
    await admin.getByRole('button', { name: 'Sign owner out everywhere' }).click()
    await admin.getByRole('dialog').getByRole('button', { name: 'Sign owner out everywhere' }).click()
    await expect.poll(() => admin.getByText('The owner was signed out everywhere.').count()).toBeGreaterThan(0)

    // The phone's next request (opening the account page from the menu) ends the session in the app.
    await phone.getByRole('link', { name: 'More' }).click()
    await phone.getByRole('link', { name: 'Account' }).click()
    await phone.waitForURL(/\/sign-in\?redirect=%2Faccount|\/sign-in\?redirect=\/account/)
    expect(await phone.getByText(shop).count()).toBe(0)
  })
})
