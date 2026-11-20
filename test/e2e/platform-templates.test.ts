import { afterAll, beforeAll, describe, expect, inject, it, onTestFailed } from 'vitest'
import type { Browser, Page } from 'playwright-core'
import type { SlipDesign } from '#shared/contracts/slip-design'
import type { TemplateDetail } from '#shared/contracts/templates'
import { createElement } from '#shared/slip/elements'
import { createTemplateWithArtwork } from './support/templates'
import { launchBrowser, newDevice, screenshotOnFailure, signIn } from './support/browser'

// Templates attached to shops (plan §4, step 2): a new shop starts with none; attached and detached
// on the shop's page (and by the Studio's Publish and assign, shop-setup.test.ts); detached
// everywhere by Archive.

const host = inject('e2eHost')
const accounts = inject('e2eAccounts')
let browser: Browser

beforeAll(async () => {
  browser = await launchBrowser()
})

afterAll(async () => {
  await browser?.close()
})

async function api<T>(page: Page, path: string, init: { method: string, body: unknown }): Promise<T> {
  return page.evaluate(async ({ path, init }) => {
    const response = await fetch(`/api${path}`, { method: init.method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body) })
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
    return response.json()
  }, { path, init }) as Promise<T>
}

/** A published template, made through the API. */
async function publishedTemplate(page: Page, name: string) {
  const created = await createTemplateWithArtwork(page, { name, width: 800, height: 500 })
  const design: SlipDesign = { ...created.design, elements: [createElement('orderNo', { id: 'no' })] }
  const saved = await api<TemplateDetail>(page, `/platform/templates/${created.id}`, { method: 'PATCH', body: { version: 1, design } })
  return api<TemplateDetail>(page, `/platform/templates/${created.id}/publish`, { method: 'POST', body: { version: saved.version } })
}

describe('templates and shops', () => {
  it('a new shop has no template; attached and detached on the shop\'s page; archive detaches it', async () => {
    const page = await newDevice(browser, { width: 1440, height: 900 })
    onTestFailed(screenshotOnFailure('platform-templates', [page]))
    await page.goto(`${host}/platform/shops/new`)
    await page.waitForURL(/\/sign-in/)
    await signIn(page, accounts.admin.username, accounts.admin.password)
    await page.waitForURL(`${host}/platform/shops/new`)
    const template = await publishedTemplate(page, 'Mekong slip')
    await page.reload()

    await page.getByLabel('Shop name').fill('Mekong Laundry')
    await page.getByLabel('Owner\'s name').fill('Dara')
    await page.getByLabel('Username').fill('mekong_owner')
    await page.getByLabel('Temporary password').fill('mekong temp 1')
    await page.getByRole('button', { name: 'Create shop' }).click()
    await page.waitForURL(/\/platform\/shops\/[\da-f-]{36}$/)

    const attached = page.getByTestId('shop-templates')
    const none = () => page.getByText('No template yet: the owner can\'t take orders until one is attached.').count()
    await expect.poll(none).toBe(1)
    const attach = async () => {
      await page.getByRole('combobox', { name: 'Attach a template' }).click()
      await page.getByRole('option', { name: 'Mekong slip' }).click()
      await page.getByRole('button', { name: 'Attach', exact: true }).click()
      await expect.poll(() => attached.textContent()).toContain('Mekong slip')
    }
    await attach()
    await attached.getByRole('button', { name: 'Detach' }).click()
    await expect.poll(none).toBe(1)
    await attach()
    const shopUrl = page.url()

    // Archive detaches it everywhere.
    await page.goto(`${host}/platform/templates/${template.id}`)
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: 'Archive' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click()
    await expect.poll(() => page.getByText('This template is archived: it can\'t be changed or attached. Restore it to use it again.').count()).toBe(1)

    await page.goto(shopUrl)
    await expect.poll(() => page.getByText('No template yet: the owner can\'t take orders until one is attached.').count()).toBe(1)
  })
})
