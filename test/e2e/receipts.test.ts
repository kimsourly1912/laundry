import { afterAll, beforeAll, describe, expect, inject, it, onTestFailed } from 'vitest'
import type { Browser } from 'playwright-core'
import { launchBrowser, newDevice, screenshotOnFailure, signIn } from './support/browser'

// The receipt (D28): the platform uploads a shop's slip and places the order's details on it;
// the server renders it; the owner sees an order's receipt as the customer gets it.

const host = inject('e2eHost')
const accounts = inject('e2eAccounts')
let browser: Browser

beforeAll(async () => {
  browser = await launchBrowser()
})

afterAll(async () => {
  await browser?.close()
})

describe('the receipt', () => {
  it('the platform designs it, previews the server\'s PNG; the owner sees an order\'s receipt', async () => {
    const { receiptOwner } = accounts
    const admin = await newDevice(browser, { width: 1280, height: 800 })
    onTestFailed(screenshotOnFailure('receipts-admin', [admin]))

    // A made-up slip: a screenshot of a pink card, as a PNG.
    await admin.setContent('<body style="margin:0"><div style="width:600px;height:400px;background:#fde7ef;border:8px solid #d63384;box-sizing:border-box"></div></body>')
    const slip = await admin.locator('div').screenshot()

    await admin.goto(`${host}/sign-in`)
    await signIn(admin, accounts.admin.username, accounts.admin.password)
    await admin.waitForURL(`${host}/platform/shops`)
    await admin.getByRole('link', { name: new RegExp(receiptOwner.shop) }).click()
    await admin.getByRole('link', { name: 'Design the receipt' }).click()
    await admin.waitForURL(/\/platform\/shops\/[^/]+\/receipt$/)
    await expect.poll(() => admin.getByText('No receipt design yet').count()).toBe(1)

    await admin.getByLabel('Choose the slip image').setInputFiles({ name: 'slip.png', mimeType: 'image/png', buffer: slip })
    await expect.poll(() => admin.getByText('600 × 400 pixels').count()).toBe(1)

    // Two fields: the customer and the shirts.
    for (const name of ['Customer', 'Shirt · Wash & iron']) {
      await admin.getByText('Choose what to show').click()
      await admin.getByRole('option', { name, exact: true }).click()
    }
    await expect.poll(() => admin.getByText('Fields (2)').count()).toBe(1)
    // The selected field moves with the arrow keys.
    const shirts = admin.getByRole('button', { name: 'Shirt · Wash & iron', pressed: true }).first()
    await shirts.focus()
    await admin.keyboard.press('Shift+ArrowLeft')
    await expect.poll(() => admin.getByRole('listitem').filter({ hasText: 'Shirt · Wash & iron' }).textContent()).toMatch(/290, 200/)
    await admin.getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => admin.getByText('The receipt design was saved.').count()).toBeGreaterThan(0)

    await admin.getByRole('button', { name: 'Preview' }).click()
    const preview = admin.getByRole('dialog').getByRole('img', { name: 'The receipt with made-up values' })
    await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth)).toBe(600)
    await admin.screenshot({ path: 'test-results/receipt-designer.png' })

    // The owner: a slip, then the order's receipt from its page.
    const owner = await newDevice(browser)
    onTestFailed(screenshotOnFailure('receipts-owner', [owner]))
    await owner.goto(`${host}/orders/new`)
    await signIn(owner, receiptOwner.username, receiptOwner.password)
    await owner.waitForURL(`${host}/orders/new`)
    await owner.getByLabel('Name').fill('Dara')
    await owner.getByRole('button', { name: 'One more Shirt' }).click()
    await owner.getByRole('button', { name: 'Save order' }).click()
    await expect.poll(() => owner.getByRole('status').textContent()).toMatch(/#1/)
    // The counter shows the QR that links the customer's Telegram to this order.
    await expect.poll(() => owner.getByRole('img', { name: 'QR code for updates on Telegram' }).count()).toBe(1)
    await owner.screenshot({ path: 'test-results/receipt-saved-qr.png', fullPage: true })
    await owner.goto(`${host}/`)
    await owner.getByRole('link', { name: /#1/ }).first().click()
    // Nobody scanned yet: the page says so, with the QR a tap away.
    await expect.poll(() => owner.getByText('The customer isn\'t getting this order on Telegram yet.').count()).toBe(1)
    await owner.screenshot({ path: 'test-results/order-telegram.png', fullPage: true })
    await owner.getByRole('button', { name: 'More actions' }).click()
    await owner.getByRole('menuitem', { name: 'Receipt' }).click()
    const receipt = owner.getByRole('dialog').getByRole('img', { name: 'Receipt for order 1' })
    await expect.poll(() => receipt.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth)).toBe(600)
  })
})
