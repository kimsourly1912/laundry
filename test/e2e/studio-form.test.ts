import { afterAll, beforeAll, describe, expect, inject, it, onTestFailed } from 'vitest'
import type { Browser, Page } from 'playwright-core'
import type { TemplateDetail } from '#shared/contracts/templates'
import { createTemplateWithArtwork } from './support/templates'
import { launchBrowser, newDevice, screenshotOnFailure, signIn } from './support/browser'

// Form fields (plan §5.3, S3, D36): add fields, label them (one label, Khmer allowed), the publish checks, the
// fill order, and Try it (the owner's form, nothing saved).

const host = inject('e2eHost')
const accounts = inject('e2eAccounts')
let browser: Browser

beforeAll(async () => {
  browser = await launchBrowser()
})

afterAll(async () => {
  await browser?.close()
})

async function saved(page: Page, id: string): Promise<TemplateDetail> {
  await expect.poll(() => page.getByTestId('save-status').textContent()).toBe('Saved')
  return page.evaluate(async id => (await fetch(`/api/platform/templates/${id}`)).json(), id)
}

async function setLabel(page: Page, label: string) {
  await page.getByRole('button', { name: 'Label', exact: true }).click()
  await page.getByTestId('label').fill(label)
  await page.getByTestId('label').press('Enter')
  await page.keyboard.press('Escape')
}

describe('studio form fields', () => {
  it('adds and labels fields, refuses to publish without labels, fills them in Try it, and publishes', async () => {
    const page = await newDevice(browser, { width: 1440, height: 900 })
    onTestFailed(screenshotOnFailure('studio-form', [page]))
    await page.goto(`${host}/platform/templates`)
    await page.waitForURL(/\/sign-in/)
    await signIn(page, accounts.admin.username, accounts.admin.password)
    await page.waitForURL(`${host}/platform/templates`)
    const created = await createTemplateWithArtwork(page, { name: 'Form test', width: 1200, height: 800 })
    await page.goto(`${host}/platform/templates/${created.id}`)

    await page.getByRole('button', { name: 'Order No.' }).click()
    expect(await page.getByRole('button', { name: 'Order No.' }).isDisabled()).toBe(true)
    await page.getByRole('button', { name: 'Number' }).click()

    // A number field without labels can't be published.
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect.poll(() => page.getByText('Number needs a label.').count()).toBe(1)
    await page.getByText('Number needs a label.').click()
    // A shop that reads Khmer gets its labels in Khmer.
    await setLabel(page, 'អាវ')

    for (const field of ['Phone', 'Amount', 'Paid / Not paid']) await page.getByRole('button', { name: field, exact: true }).click()
    const design = (await saved(page, created.id)).design
    expect(design.elements.map(element => element.type)).toEqual(['orderNo', 'number', 'phone', 'amount', 'paid', 'paid'])
    expect(design.elements[1]).toMatchObject({ label: 'អាវ' })
    expect(await page.getByTestId('fill-order').locator('li').allTextContents()).toEqual(['1អាវ', '2Phone', '3Amount', '4Paid / Not paid'])

    // Try it: the owner's form shows the label as written.
    await page.getByRole('button', { name: 'Try it' }).click()
    await expect.poll(() => page.getByTestId('fill-step').textContent()).toContain('អាវ')
    await page.getByTestId('fill-number').fill('3')
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByTestId('fill-phone').fill('01')
    await page.getByRole('button', { name: 'Check like Save' }).click()
    await expect.poll(() => page.getByText('Not a valid phone number.').count()).toBe(1)
    await page.getByTestId('fill-phone').fill('012 345 678')
    await page.getByRole('button', { name: 'Check like Save' }).click()
    await expect.poll(() => page.getByText('The slip can be saved.').count()).toBe(1)
    await page.keyboard.press('Escape')

    // Every check passes: Publish goes straight ahead.
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect.poll(() => page.getByText('Everything a slip needs is there.').count()).toBe(1)
    await page.getByRole('button', { name: 'Publish version 1' }).click()
    await expect.poll(() => page.getByText('Version 1 is published.').count()).toBeGreaterThan(0)
  })
})
