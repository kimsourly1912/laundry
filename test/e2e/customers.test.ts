import { afterAll, beforeAll, describe, expect, inject, it, onTestFailed } from 'vitest'
import type { Browser } from 'playwright-core'
import { launchBrowser, newDevice, screenshotOnFailure, signIn } from './support/browser'

// M2.2: an owner adds customers, finds them by name or phone, is offered the existing customer for
// a taken phone, and anonymizes one.

const host = inject('e2eHost')
const accounts = inject('e2eAccounts')
let browser: Browser

beforeAll(async () => {
  browser = await launchBrowser()
})

afterAll(async () => {
  await browser?.close()
})

describe('customers', () => {
  it('add, find by phone in another format, offer the existing customer, anonymize', async () => {
    const { username, password } = accounts.customerOwner
    const page = await newDevice(browser)
    onTestFailed(screenshotOnFailure('customers', [page]))
    await page.goto(`${host}/customers/new`)
    await signIn(page, username, password)
    await page.waitForURL(`${host}/customers/new`)

    await page.getByLabel('Name').fill('Sokha Chan')
    await page.getByLabel('Phone').fill('012345678')
    await page.getByRole('button', { name: 'Add customer' }).click()
    await page.waitForURL(/\/customers\/[0-9a-f-]{36}$/)
    // Shown the Cambodian way, whatever was typed.
    expect(await page.getByLabel('Phone').inputValue()).toBe('012 345 678')
    const sokhaUrl = page.url()

    // The same number typed another way: offered Sokha instead of a second customer.
    await page.goto(`${host}/customers/new`)
    await page.getByLabel('Name').fill('Someone Else')
    await page.getByLabel('Phone').fill('+855 12 345 678')
    await page.getByRole('button', { name: 'Add customer' }).click()
    // Choosing them doesn't ask about the typed name: it's no longer wanted.
    await page.getByRole('button', { name: 'Open Sokha Chan' }).click()
    await page.waitForURL(sokhaUrl)

    // Found by digits of the phone, in the list.
    await page.goto(`${host}/customers?search=345678`)
    await expect.poll(() => page.getByRole('link', { name: /Sokha Chan/ }).count()).toBe(1)

    // Anonymized: removed from the list, the page says "Former customer".
    await page.goto(sokhaUrl)
    await page.getByRole('button', { name: 'Anonymize' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Anonymize' }).click()
    await expect.poll(() => page.getByText('Former customer').count()).toBeGreaterThan(0)
    await page.goto(`${host}/customers`)
    await expect.poll(() => page.getByText('No customers yet').count()).toBe(1)
  })
})
