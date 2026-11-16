import { afterAll, beforeAll, describe, expect, inject, it, onTestFailed } from 'vitest'
import type { Browser } from 'playwright-core'
import { launchBrowser, newDevice, screenshotOnFailure, signIn } from './support/browser'

// The paper-slip flow (D27), on a phone: the owner fills in the slip for a new phone number (3
// shirts, 2.5 kg), saves, marks it ready on the board, and hands it over paid in one tap. Then a
// walk-in, and the board's search.

const host = inject('e2eHost')
const accounts = inject('e2eAccounts')
let browser: Browser

beforeAll(async () => {
  browser = await launchBrowser()
})

afterAll(async () => {
  await browser?.close()
})

describe('orders (D27)', () => {
  it('slip → saved → ready → paid and collected, on the board', async () => {
    const { username, password } = accounts.orderOwner
    const page = await newDevice(browser)
    onTestFailed(screenshotOnFailure('orders', [page]))
    await page.goto(`${host}/orders/new`)
    await signIn(page, username, password)
    await page.waitForURL(`${host}/orders/new`)

    // Nothing filled in: the slip says so.
    await page.getByRole('button', { name: 'Save order' }).click()
    await expect.poll(() => page.getByText('Fill in at least one item').count()).toBe(1)

    // A new phone and name, 3 shirts by the steppers, 2.5 kg typed; the preview total follows.
    await page.getByLabel('Phone').fill('012 999 888')
    await page.getByLabel('Name').fill('Dara Chan')
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'One more Shirt' }).click()
    await page.getByLabel('Kilograms of Mixed clothes').fill('2.5')
    await expect.poll(() => page.getByText('Fill in at least one item').count()).toBe(0)
    await expect.poll(() => page.getByText('13,500៛').count()).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Save order' }).click()

    // Saved: the number to write on the bag.
    await expect.poll(() => page.getByRole('status').textContent()).toMatch(/#1\s*Dara Chan · 13,500៛/)

    // The same phone, typed another way, is a known customer on the next slip.
    await page.getByRole('button', { name: 'Next order' }).click()
    await page.getByLabel('Phone').fill('+855 12 999 888')
    await expect.poll(() => page.getByText('Dara Chan').count()).toBe(1)
    expect(await page.getByLabel('Name').count()).toBe(0)

    // The board: waiting → Ready → Collected, paid now.
    await page.goto(`${host}/`)
    const row = page.getByRole('listitem').filter({ hasText: '#1' })
    await row.getByRole('button', { name: 'Mark ready' }).click()
    await expect.poll(() => page.getByText('Order #1 is ready.').count()).toBeGreaterThan(0)
    await page.getByRole('tab', { name: /Ready/ }).click()
    await row.getByRole('button', { name: 'Collected' }).click()
    await expect.poll(() => page.getByRole('dialog').textContent()).toContain('13,500៛ isn\'t paid yet')
    await page.getByRole('dialog').getByRole('button', { name: 'Paid now and collected' }).click()
    await expect.poll(() => page.getByText('Order #1 collected.').count()).toBeGreaterThan(0)
    await page.getByRole('tab', { name: /Done/ }).click()
    await expect.poll(() => row.textContent()).toMatch(/Collected.*Paid|Paid.*Collected/)
  })

  it('a walk-in: no phone, no name; the board finds orders by phone', async () => {
    const { username, password } = accounts.orderOwner
    const page = await newDevice(browser)
    onTestFailed(screenshotOnFailure('orders-walk-in', [page]))
    await page.goto(`${host}/orders/new`)
    await signIn(page, username, password)
    await page.waitForURL(`${host}/orders/new`)
    await page.getByRole('button', { name: 'One more Shirt' }).click()
    await page.getByRole('switch', { name: 'Paid' }).click()
    await page.getByRole('button', { name: 'Save order' }).click()
    await expect.poll(() => page.getByRole('status').textContent()).toMatch(/Walk-in · 2,000៛/)

    await page.goto(`${host}/?search=999888`)
    await expect.poll(() => page.getByRole('link', { name: /#1 · Dara Chan/ }).count()).toBe(1)
    expect(await page.getByRole('link', { name: /Walk-in/ }).count()).toBe(0)
  })
})
