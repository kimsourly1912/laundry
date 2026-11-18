import { afterAll, beforeAll, describe, expect, inject, it, onTestFailed } from 'vitest'
import type { Browser, Page } from 'playwright-core'
import { createTemplateWithArtwork } from './support/templates'
import { launchBrowser, newDevice, screenshotOnFailure, signIn } from './support/browser'

// The studio (plan §5, D35): a template starts from an artwork (PNG, JPEG, or SVG drawn to a PNG in
// the browser), its draft saves by itself, Preview is the server's PNG, and Publish makes a version.
// Desktop only.

const host = inject('e2eHost')
const accounts = inject('e2eAccounts')
let browser: Browser

beforeAll(async () => {
  browser = await launchBrowser()
})

afterAll(async () => {
  await browser?.close()
})

const DESKTOP = { width: 1440, height: 900 }

async function signInAsAdmin(page: Page, path: string) {
  await page.goto(`${host}${path}`)
  await page.waitForURL(/\/sign-in/)
  await signIn(page, accounts.admin.username, accounts.admin.password)
  await page.waitForURL(`${host}${path}`)
}

describe('studio', () => {
  it('opens a saved artwork template, saves a rename, previews and publishes it', async () => {
    const page = await newDevice(browser, DESKTOP)
    onTestFailed(screenshotOnFailure('studio-artwork', [page]))
    await signInAsAdmin(page, '/platform/templates')

    const created = await createTemplateWithArtwork(page, { name: 'Linda slip', width: 900, height: 600 })
    await page.goto(`${host}/platform/templates/${created.id}`)
    const canvas = page.getByTestId('studio-canvas')
    await expect.poll(() => canvas.locator('svg image').count()).toBe(1)
    await expect.poll(() => page.getByText('900 × 600 px').count()).toBe(1)
    await expect.poll(() => page.getByTestId('save-status').textContent()).toBe('Saved')

    await page.getByRole('button', { name: 'Rename Linda slip' }).click()
    await page.getByLabel('Template name').fill('Linda slip 2026')
    await page.keyboard.press('Enter')
    await expect.poll(() => page.getByTestId('save-status').textContent()).toBe('Not saved yet')
    await expect.poll(() => page.getByTestId('save-status').textContent()).toBe('Saved')

    await page.getByRole('button', { name: 'Preview' }).click()
    const preview = page.getByTestId('preview-image')
    await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth)).toBe(900)
    await page.keyboard.press('Escape')

    // Publish needs an Order No.; without Amount and Phone it warns and may go ahead.
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect.poll(() => page.getByText('Add an Order No. field (Fields panel).').count()).toBe(1)
    expect(await page.getByRole('button', { name: 'Publish version 1' }).isDisabled()).toBe(true)
    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('button', { name: 'Order No.' }).click()
    await expect.poll(() => page.getByTestId('save-status').textContent()).toBe('Saved')
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect.poll(() => page.getByText('There\'s no Amount field.').count()).toBe(1)
    await page.getByRole('button', { name: 'Publish version 1 anyway' }).click()
    await expect.poll(() => page.getByText('Version 1 is published.').count()).toBeGreaterThan(0)
    // Nothing new to publish.
    await expect.poll(() => page.getByRole('button', { name: 'Publish', exact: true }).isDisabled()).toBe(true)

    // A reload shows the saved name and status.
    await page.reload()
    await expect.poll(() => page.getByRole('button', { name: 'Rename Linda slip 2026' }).count()).toBe(1)
    await expect.poll(() => page.getByText('Published', { exact: true }).count()).toBe(1)

    await page.getByRole('link', { name: 'Templates' }).click()
    // Its own row: other e2e files publish templates into the same list.
    const row = page.getByRole('listitem').filter({ hasText: 'Linda slip 2026' })
    await expect.poll(() => row.getByText('Version 1').count()).toBe(1)
  })

  it('shows a version conflict when another window changed an artwork template', async () => {
    const page = await newDevice(browser, DESKTOP)
    onTestFailed(screenshotOnFailure('studio-svg', [page]))
    await signInAsAdmin(page, '/platform/templates')
    const { id } = await createTemplateWithArtwork(page, { name: 'Narrow receipt', width: 600, height: 1000 })
    await page.goto(`${host}/platform/templates/${id}`)

    // Another window renames it: this window's next save is stale.
    const other = await page.context().newPage()
    await other.goto(`${host}/platform/templates/${id}`)
    await other.getByRole('button', { name: 'Rename Narrow receipt' }).click()
    await other.getByLabel('Template name').fill('Narrow receipt A')
    await other.keyboard.press('Enter')
    await expect.poll(() => other.getByTestId('save-status').textContent()).toBe('Saved')

    await page.getByRole('button', { name: 'Rename Narrow receipt' }).click()
    await page.getByLabel('Template name').fill('Narrow receipt B')
    await page.keyboard.press('Enter')
    await expect.poll(() => page.getByText('This template changed in another window. Reload to see it.').count()).toBe(1)
  })

  it('asks for a computer on a small screen', async () => {
    const page = await newDevice(browser, { width: 1024, height: 768 })
    await signInAsAdmin(page, '/platform/templates')
    const first = page.getByRole('link', { name: /Linda slip 2026/ })
    await first.click()
    await expect.poll(() => page.getByText('Open the studio on a computer').count()).toBe(1)
  })
})
