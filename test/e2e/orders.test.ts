import { afterAll, beforeAll, describe, expect, inject, it, onTestFailed } from 'vitest'
import type { Browser } from 'playwright-core'
import { launchBrowser, newDevice, screenshotOnFailure, signIn } from './support/browser'

// M2.3 (spec §15 → E2E: create order → ready → collect), on a phone: an owner takes an order for a
// new customer by pieces and by weight, marks it ready, records the payment and hands it over.

const host = inject('e2eHost')
const accounts = inject('e2eAccounts')
let browser: Browser

beforeAll(async () => {
  browser = await launchBrowser()
})

afterAll(async () => {
  await browser?.close()
})

describe('orders', () => {
  it('new order → ready → payment → collected, then Today and the list agree', async () => {
    const { username, password } = accounts.orderOwner
    const page = await newDevice(browser)
    onTestFailed(screenshotOnFailure('orders', [page]))
    await page.goto(`${host}/orders/new`)
    await signIn(page, username, password)
    await page.waitForURL(`${host}/orders/new`)

    // Step 1: a new customer, added in the flow.
    await page.getByRole('button', { name: 'New customer' }).click()
    await page.getByLabel('Name').fill('Dara Chan')
    await page.getByLabel('Phone').fill('012 999 888')
    await page.getByRole('button', { name: 'Add customer' }).click()

    // Step 2: 3 shirts and 2.5 kg of mixed clothes; the preview total is 6,000 + 7,500.
    await page.getByRole('button', { name: 'Add a line' }).click()
    await page.getByRole('option', { name: /Shirt/ }).click()
    await page.getByLabel('Pieces').fill('3')
    await page.getByRole('button', { name: 'Add a line' }).click()
    await page.getByRole('option', { name: /Mixed clothes/ }).click()
    await page.getByLabel('Weight (kg)').fill('2.5')
    await expect.poll(() => page.getByText('13,500៛').count()).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 3: review and create; the server's total is the one shown.
    await page.getByRole('button', { name: 'Create order' }).click()
    await expect.poll(() => page.getByText('Order #1 created').count()).toBe(1)
    await page.getByRole('link', { name: 'View order' }).click()
    await page.waitForURL(/\/orders\/[0-9a-f-]{36}$/)

    await page.getByRole('button', { name: 'Mark ready' }).click()
    await expect.poll(() => page.getByText('Order #1 is ready.').count()).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Record payment' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Record payment' }).click()
    await expect.poll(() => page.getByText('Payment recorded.').count()).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Collected' }).click()
    await expect.poll(() => page.getByText('Order #1 collected.').count()).toBeGreaterThan(0)
    expect(await page.getByRole('button', { name: 'Record payment' }).count()).toBe(0)

    // Today: collected today, nothing waiting or unpaid.
    await page.goto(`${host}/`)
    await expect.poll(() => page.getByText('Nothing is waiting to be collected.').count()).toBe(1)
    expect(await page.getByText('Every order is paid.').count()).toBe(1)

    // The list finds it by the customer's phone, typed another way.
    await page.goto(`${host}/orders?search=999888`)
    await expect.poll(() => page.getByRole('link', { name: /#1 · Dara Chan/ }).count()).toBe(1)
  })
})
