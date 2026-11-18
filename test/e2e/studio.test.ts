import { afterAll, beforeAll, describe, expect, inject, it, onTestFailed } from 'vitest'
import type { Browser, Page } from 'playwright-core'
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

/** A PNG of the page itself, as a stand-in for an artwork. */
async function artworkOf(page: Page, width: number, height: number) {
  return page.screenshot({ clip: { x: 0, y: 0, width, height } })
}

describe('studio', () => {
  it('starts a template from a PNG artwork, saves a rename by itself, previews and publishes it', async () => {
    const page = await newDevice(browser, DESKTOP)
    onTestFailed(screenshotOnFailure('studio-artwork', [page]))
    await signInAsAdmin(page, '/platform/templates')

    await page.getByRole('button', { name: 'New template' }).first().click()
    await page.getByTestId('artwork-input').setInputFiles({ name: 'linda-slip.png', mimeType: 'image/png', buffer: await artworkOf(page, 900, 600) })
    await expect.poll(() => page.getByText('Artwork ready: 900 × 600 px.').count()).toBe(1)
    // Under 1000 px on its long side: the studio warns.
    await expect.poll(() => page.getByText(/will look soft/).count()).toBe(1)
    expect(await page.getByLabel('Template name').inputValue()).toBe('linda-slip')
    await page.getByLabel('Template name').fill('Linda slip')
    await page.getByRole('button', { name: 'Create and open' }).click()

    await page.waitForURL(/\/platform\/templates\/[\da-f-]{36}$/)
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

  it('turns an SVG artwork into a PNG in the browser, and says "Reload" when another window changed it', async () => {
    const page = await newDevice(browser, DESKTOP)
    onTestFailed(screenshotOnFailure('studio-svg', [page]))
    await signInAsAdmin(page, '/platform/templates')
    await page.getByRole('button', { name: 'New template' }).first().click()
    // As an AI tool writes it: Khmer as <text>, a script and an outside link, none of which run.
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 1000"><rect width="600" height="1000" fill="#fffbeb"/>'
      + '<text x="40" y="80" font-size="40">ហាងបោកអ៊ុត</text><script>window.ran = true</script>'
      + '<image href="https://example.com/x.png" width="10" height="10"/></svg>'
    await page.getByTestId('artwork-input').setInputFiles({ name: 'narrow-receipt.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) })
    await expect.poll(() => page.getByText('Artwork ready: 600 × 1000 px.').count()).toBe(1)
    await expect.poll(() => page.getByText(/Turned from SVG into PNG/).count()).toBe(1)
    expect(await page.evaluate(() => (window as { ran?: boolean }).ran)).toBeUndefined()
    expect(await page.getByLabel('Template name').inputValue()).toBe('narrow-receipt')
    await page.getByLabel('Template name').fill('Narrow receipt')
    await page.getByRole('button', { name: 'Create and open' }).click()
    await page.waitForURL(/\/platform\/templates\/[\da-f-]{36}$/)
    await expect.poll(() => page.getByText('600 × 1000 px').count()).toBe(1)
    // The server keeps a PNG, not the SVG.
    const id = page.url().split('/').pop()!
    const stored = await page.evaluate(async (id) => {
      const template = await (await fetch(`/api/platform/templates/${id}`)).json() as { design: { background: { imageId: string } } }
      return (await fetch(`/api/platform/images/${template.design.background.imageId}`)).headers.get('content-type')
    }, id)
    expect(stored).toBe('image/png')

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
