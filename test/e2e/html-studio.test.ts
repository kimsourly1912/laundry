import { afterAll, beforeAll, expect, inject, it, onTestFailed } from 'vitest'
import type { Browser } from 'playwright-core'
import { launchBrowser, newDevice, screenshotOnFailure, signIn } from './support/browser'

const host = inject('e2eHost')
const accounts = inject('e2eAccounts')
let browser: Browser

beforeAll(async () => {
  browser = await launchBrowser()
})

afterAll(async () => {
  await browser?.close()
})

it('creates an HTML draft from the split editor, previews bindings and publishes', async () => {
  const page = await newDevice(browser, { width: 1440, height: 900 })
  onTestFailed(screenshotOnFailure('html-studio', [page]))
  await page.goto(`${host}/platform/templates`)
  await page.waitForURL(/\/sign-in/)
  await signIn(page, accounts.admin.username, accounts.admin.password)
  await page.waitForURL(`${host}/platform/templates`)

  let createRequests = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/platform/templates')) createRequests++
  })
  await page.getByRole('link', { name: 'Create template' }).first().click()
  await page.waitForURL('**/platform/templates/new')
  const editor = page.getByTestId('html-source').locator('.cm-content')
  const preview = page.getByTestId('html-preview')
  await expect.poll(() => editor.textContent()).toContain('{{fields.weight_kg}}')
  await expect.poll(() => preview.getAttribute('src')).toMatch(/^blob:/)
  expect(createRequests).toBe(0)

  const invalid = '<div class="flex">{{fields.unknown}}</div>'
  await editor.fill(invalid)
  await expect.poll(() => page.getByTestId('html-problems').textContent()).toContain('fields.unknown')
  await expect.poll(() => page.getByText('Preview is out of date.').count()).toBe(1)

  const html = '<div class="flex flex-col"><span>{{order.number}}</span><span>{{fields.weight_kg}}</span><div class="flex">{{order.qrCode}}</div></div>'
  await page.getByRole('button', { name: 'Import AI answer' }).click()
  await page.getByRole('dialog').locator('textarea').fill(JSON.stringify({ version: 1, name: 'CodeMirror by-weight slip', html }))
  await page.getByTestId('answer-import').click()
  await expect.poll(() => editor.textContent()).toContain('{{fields.weight_kg}}')
  await expect.poll(() => page.getByRole('link', { name: 'Download SVG' }).count()).toBe(1)
  await page.getByRole('button', { name: 'Save draft' }).click()
  await page.waitForURL(/\/platform\/templates\/[\da-f-]{36}$/)
  expect(createRequests).toBe(1)

  await page.getByTestId('html-publish').click()
  await page.getByTestId('html-publish-confirm').click()
  await expect.poll(() => page.getByText('Version 1 is published.').count()).toBeGreaterThan(0)
})
