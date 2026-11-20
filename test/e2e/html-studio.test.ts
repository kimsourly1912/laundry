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

it('edits markup with VS Code keys: Tab indents, Shift-Tab outdents, Escape then Tab leaves', async () => {
  const page = await newDevice(browser, { width: 1440, height: 900 })
  onTestFailed(screenshotOnFailure('html-studio-keys', [page]))
  await page.goto(`${host}/platform/templates`)
  await page.waitForURL(/\/sign-in/)
  await signIn(page, accounts.admin.username, accounts.admin.password)
  await page.waitForURL(`${host}/platform/templates`)
  await page.getByRole('link', { name: 'Create template' }).first().click()
  await page.waitForURL('**/platform/templates/new')
  const editor = page.getByTestId('html-source').locator('.cm-content')
  await editor.waitFor()

  await editor.fill('<span>a</span>\n<span>b</span>')
  await editor.press('Control+Home')
  await editor.press('Tab')
  await expect.poll(() => editor.textContent()).toBe('  <span>a</span><span>b</span>')
  await editor.press('Control+a')
  await editor.press('Tab')
  await expect.poll(() => editor.textContent()).toBe('    <span>a</span>  <span>b</span>')
  await editor.press('Shift+Tab')
  await editor.press('Shift+Tab')
  await expect.poll(() => editor.textContent()).toBe('<span>a</span><span>b</span>')
  await editor.press('Control+Home')
  await editor.press('Alt+ArrowDown')
  await expect.poll(() => editor.textContent()).toBe('<span>b</span><span>a</span>')

  await editor.press('Escape')
  await editor.press('Tab')
  expect(await editor.evaluate(element => element.contains(document.activeElement))).toBe(false)
})

it('has editor shortcuts: Ctrl+S formats, Ctrl+B toggles the sidebar, Emmet expands, the font is a preference', async () => {
  const page = await newDevice(browser, { width: 1440, height: 900 })
  onTestFailed(screenshotOnFailure('html-studio-shortcuts', [page]))
  await page.goto(`${host}/platform/templates`)
  await page.waitForURL(/\/sign-in/)
  await signIn(page, accounts.admin.username, accounts.admin.password)
  await page.waitForURL(`${host}/platform/templates`)
  await page.getByRole('link', { name: 'Create template' }).first().click()
  await page.waitForURL('**/platform/templates/new')
  const editor = page.getByTestId('html-source').locator('.cm-content:not([aria-readonly])')
  await editor.waitFor()

  // Ctrl+S formats the markup, as the Format button does, and doesn't open the browser's save dialog.
  await editor.fill('<div><span>a</span></div>')
  await editor.press('Control+s')
  await expect.poll(() => editor.locator('.cm-line').count()).toBeGreaterThan(1)

  // Ctrl+B collapses the sidebar and brings it back.
  const sidebarTitle = page.getByText('Intake fields').first()
  await sidebarTitle.waitFor()
  await editor.press('Control+b')
  await sidebarTitle.waitFor({ state: 'hidden' })
  await editor.press('Control+b')
  await sidebarTitle.waitFor()

  // Emmet: an abbreviation plus Tab becomes elements.
  await editor.press('Control+a')
  await editor.press('Delete')
  await editor.pressSequentially('div.p-4>span')
  await editor.press('Tab')
  await expect.poll(() => editor.textContent()).toContain('<div class="p-4"><span></span></div>')

  // Only tags a slip allows are suggested.
  await editor.press('Control+a')
  await editor.press('Delete')
  await editor.pressSequentially('<')
  const suggestions = page.locator('.cm-tooltip-autocomplete')
  await suggestions.waitFor()
  expect(await suggestions.textContent()).toContain('span')
  expect(await suggestions.textContent()).not.toContain('table')
  await editor.press('Escape')
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
  const printSample = page.getByRole('button', { name: 'Print sample' })
  // A new template starts empty: no markup, no preview, nothing to save yet.
  await page.getByTestId('html-empty').waitFor()
  expect(await editor.textContent()).toBe('')
  await page.getByTestId('html-preview-placeholder').waitFor()
  expect(await printSample.count()).toBe(0)
  await page.getByLabel('Template name').fill('CodeMirror by-weight slip')
  expect(await page.getByRole('button', { name: 'Save draft' }).isDisabled()).toBe(true)

  await page.getByRole('button', { name: 'Use a preset' }).click()
  await page.getByTestId('preset-byWeight').locator('img').waitFor()
  await page.getByTestId('preset-byWeight').click()
  await expect.poll(() => editor.textContent()).toContain('{{fields.weight_kg}}')
  expect(await page.getByTestId('html-empty').count()).toBe(0)
  await expect.poll(() => preview.getAttribute('src')).toMatch(/^blob:/)
  expect(await page.getByRole('button', { name: 'Save draft' }).isDisabled()).toBe(false)
  expect(createRequests).toBe(0)

  const previewWidth = () => preview.evaluate(image => image.getBoundingClientRect().width)
  const zoomIn = page.getByRole('button', { name: 'Zoom in' })
  const fit = page.getByRole('button', { name: 'Fit', exact: true })
  const fitWidth = await previewWidth()
  for (const zoom of [1.25, 1.5, 1.75, 2]) {
    await zoomIn.click()
    await expect.poll(async () => Math.abs(await previewWidth() - fitWidth * zoom)).toBeLessThan(1)
  }
  expect(await zoomIn.isDisabled()).toBe(true)
  await page.getByRole('button', { name: 'Zoom out' }).press('Enter')
  await expect.poll(async () => Math.abs(await previewWidth() - fitWidth * 1.75)).toBeLessThan(1)
  await fit.click()
  await expect.poll(async () => Math.abs(await previewWidth() - fitWidth)).toBeLessThan(1)

  const previewViewport = page.getByTestId('html-preview-viewport')
  const fitted = (await preview.boundingBox())!
  const pointer = { x: Math.round(fitted.x + fitted.width * 0.6), y: Math.round(fitted.y + fitted.height * 0.5) }
  await page.mouse.move(pointer.x, pointer.y)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -200)
  await page.keyboard.up('Control')
  await expect.poll(async () => Math.abs(await previewWidth() - fitWidth * 1.5625)).toBeLessThan(1)
  const zoomed = (await preview.boundingBox())!
  expect(Math.abs(zoomed.x + (pointer.x - fitted.x) * 1.5625 - pointer.x)).toBeLessThan(2)
  expect(await previewViewport.evaluate(area => getComputedStyle(area).scrollbarWidth)).toBe('none')

  const horizontalPan = () => previewViewport.evaluate(area => area.scrollLeft)
  const beforeDrag = await horizontalPan()
  await page.mouse.down()
  await page.mouse.move(pointer.x - 60, pointer.y, { steps: 4 })
  await page.mouse.up()
  await expect.poll(horizontalPan).toBeGreaterThan(beforeDrag + 50)
  await previewViewport.press('ArrowLeft')
  await expect.poll(horizontalPan).toBeLessThan(beforeDrag + 50)

  await page.keyboard.down('Control')
  await page.mouse.wheel(0, 100)
  await page.keyboard.up('Control')
  await expect.poll(async () => Math.abs(await previewWidth() - fitWidth * 1.25)).toBeLessThan(1)
  await fit.click()
  await expect.poll(async () => Math.abs(await previewWidth() - fitWidth)).toBeLessThan(1)
  await expect.poll(horizontalPan).toBe(0)

  await page.setViewportSize({ width: 1440, height: 500 })
  await expect.poll(() => previewViewport.evaluate(area => area.scrollHeight - area.clientHeight)).toBe(0)
  await expect.poll(previewWidth).toBeLessThan(fitWidth)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('tab', { name: 'Preview' }).click()
  const viewportBeforeUpdate = await previewViewport.boundingBox()
  const previewEndpoint = '**/api/platform/templates/preview'
  const lastUrl = await preview.getAttribute('src')
  const releasePreview = Promise.withResolvers<undefined>()
  await page.route(previewEndpoint, async (route) => {
    await releasePreview.promise
    await route.continue()
  }, { times: 1 })
  try {
    await page.getByRole('radio', { name: 'Crowded' }).press('Space')
    await page.getByText('Updating preview…', { exact: true }).waitFor()
    expect(await preview.getAttribute('src')).toBe(lastUrl)
    expect(await previewViewport.boundingBox()).toEqual(viewportBeforeUpdate)
    expect(await page.getByRole('button', { name: 'Download SVG' }).isDisabled()).toBe(true)
    expect(await printSample.isDisabled()).toBe(true)
    expect(await page.getByText('Preview is out of date.').count()).toBe(0)
  }
  finally {
    releasePreview.resolve(undefined)
  }
  await expect.poll(() => preview.getAttribute('src')).not.toBe(lastUrl)
  await page.getByRole('link', { name: 'Download SVG' }).waitFor()
  await page.evaluate(() => {
    window.print = () => {
      document.body.dataset.samplePrintOpened = 'true'
    }
  })
  await printSample.press('Enter')
  await expect.poll(() => page.locator('body').getAttribute('data-sample-print-opened')).toBe('true')
  const printedSlip = page.getByTestId('html-print-sample')
  const renderedImage = async (image: HTMLImageElement) => {
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    canvas.getContext('2d')!.drawImage(image, 0, 0)
    return canvas.toDataURL()
  }
  expect(await printedSlip.locator('img').evaluate(renderedImage)).toBe(await preview.evaluate(renderedImage))
  try {
    await page.emulateMedia({ media: 'print' })
    const pageSize = (await printedSlip.boundingBox())!
    expect(pageSize.width * 25.4 / 96).toBeCloseTo(100, 1)
    expect(pageSize.height * 25.4 / 96).toBeCloseTo(70, 1)
    expect(await previewViewport.isVisible()).toBe(false)
  }
  finally {
    await page.emulateMedia({ media: 'screen' })
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  }
  await expect.poll(() => printedSlip.count()).toBe(0)
  expect(createRequests).toBe(0)

  const crowdedUrl = await preview.getAttribute('src')
  await page.route(previewEndpoint, route => route.fulfill({
    contentType: 'image/svg+xml',
    body: 'An invalid image response',
  }), { times: 1 })
  await page.getByRole('radio', { name: 'Typical' }).press('Space')
  const retryPreview = page.getByRole('button', { name: 'Try again', exact: true })
  await retryPreview.waitFor()
  expect(await preview.getAttribute('src')).toBe(crowdedUrl)
  await retryPreview.click()
  await expect.poll(() => preview.getAttribute('src')).not.toBe(crowdedUrl)

  const sampleName = 'សុខ ចាន់ដារ៉ា Sok Chandara'
  await page.getByRole('button', { name: 'Test order', exact: true }).click()
  const custom = page.getByRole('dialog', { name: 'Test order' })
  const livePreview = custom.getByTestId('html-custom-preview').getByRole('img')
  const customerName = custom.getByRole('textbox', { name: 'Customer name' })
  const weight = custom.getByRole('spinbutton', { name: 'Weight (kg)' })
  const useSample = custom.getByRole('button', { name: 'Show in preview' })
  await livePreview.waitFor()
  expect((await livePreview.boundingBox())!.y).toBeLessThan((await customerName.boundingBox())!.y)
  const initialCustom = await livePreview.getAttribute('src')
  const previousSample = await preview.getAttribute('src')
  await customerName.fill(sampleName)
  await weight.fill('-5')
  await expect.poll(() => useSample.isDisabled()).toBe(true)
  expect(await livePreview.getAttribute('src')).toBe(initialCustom)

  const customResponse = page.waitForResponse(response =>
    response.url().endsWith('/api/platform/templates/preview')
    && response.request().postDataJSON().custom?.values.weight_kg === 3.5)
  await weight.fill('3.5')
  const renderedCustom = await customResponse
  expect(renderedCustom.ok()).toBe(true)
  const customInput = renderedCustom.request().postDataJSON()
  expect(customInput.custom).toMatchObject({ customerName: sampleName, values: { weight_kg: 3.5 } })
  await expect.poll(() => livePreview.getAttribute('src')).not.toBe(initialCustom)
  expect(await weight.evaluate(element => document.activeElement === element)).toBe(true)
  expect(await preview.getAttribute('src')).toBe(previousSample)
  await useSample.click()
  await expect.poll(() => preview.getAttribute('src')).not.toBe(previousSample)
  expect(await printSample.isEnabled()).toBe(true)
  expect(createRequests).toBe(0)
  expect(await page.evaluate(async (input) => {
    const response = await fetch('/api/platform/templates/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...input, custom: { ...input.custom, values: { missing_field: 3 } } }),
    })
    return response.status
  }, customInput)).toBe(400)
  await page.getByRole('radio', { name: 'Typical' }).press('Space')
  await page.getByRole('button', { name: 'Test order', exact: true }).click()
  expect(await customerName.inputValue()).toBe(sampleName)
  await customerName.fill('Discard this edit')
  await custom.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: 'Test order', exact: true }).click()
  await livePreview.waitFor()
  expect(await customerName.inputValue()).toBe(sampleName)
  expect((await livePreview.boundingBox())!.x).toBeGreaterThan((await customerName.boundingBox())!.x)
  await page.setViewportSize({ width: 844, height: 390 })
  expect((await livePreview.boundingBox())!.height).toBeGreaterThan(50)
  await page.keyboard.press('Escape')
  await custom.waitFor({ state: 'hidden' })
  await page.setViewportSize({ width: 1440, height: 900 })

  // The sidebar is on Presets (Use a preset opened it); the Fields icon switches it.
  await page.getByTestId('open-fields').click()
  // Phone is built in; the by-weight HTML prints the weight, so neither can be removed here.
  expect(await page.getByTestId('remove-phone').isDisabled()).toBe(true)
  expect(await page.getByTestId('remove-weight_kg').isDisabled()).toBe(true)
  await page.getByTestId('new-field').click()
  await page.getByTestId('count-label').fill('Bag count')
  await page.getByTestId('add-count').click()
  // The key comes from the label.
  await expect.poll(() => page.getByTestId('field-bag_count').count()).toBe(1)
  await expect.poll(() => page.getByRole('button', { name: 'Copy {{fields.bag_count}}' }).count()).toBe(1)

  // Add from list: By weight's Weight is a plain weight, so Wash & fold is still offered; picked items are quantities and ticks.
  await page.getByTestId('add-from-list').click()
  const itemList = page.getByRole('dialog', { name: 'Add from the item list' })
  expect(await itemList.getByRole('checkbox', { name: 'Wash & fold', exact: true }).isDisabled()).toBe(false)
  // The service tick By weight prints is on the slip; it says it's a tick, apart from the per-kg Wash & iron.
  expect(await itemList.getByTestId('item-wash_iron').isDisabled()).toBe(true)
  const itemRow = (key: string) => itemList.getByRole('listitem').filter({ has: page.getByTestId(`item-${key}`) })
  expect(await itemRow('wash_iron').textContent()).toContain('Service tick')
  expect(await itemRow('wash_iron_kg').textContent()).toContain('Weight in kg')
  await itemList.getByTestId('item-search').fill('shi')
  await itemList.getByRole('checkbox', { name: 'Shirt', exact: true }).click()
  await itemList.getByTestId('item-search').fill('')
  await itemList.getByRole('checkbox', { name: 'Express', exact: true }).click()
  await itemList.getByTestId('item-add').click()
  await itemList.waitFor({ state: 'hidden' })
  await expect.poll(() => page.getByTestId('placement-shirt_count').textContent()).toBe('Not placed')
  // D44: no pricing in the Studio; staff type the total.
  expect(await page.getByTestId('pricing-toggle').count()).toBe(0)
  await expect.poll(() => page.getByTestId('field-express').count()).toBe(1)

  await editor.fill('<div class="flex">{{fields.bag')
  await editor.press('Control+Space')
  await expect.poll(() => page.getByRole('option', { name: /fields\.bag_count/ }).count()).toBe(1)
  await editor.press('Escape')

  const invalid = '<div class="flex">{{fields.unknown}}</div>'
  await editor.fill(invalid)
  await expect.poll(() => page.getByTestId('html-problems').textContent()).toContain('fields.unknown')
  await expect.poll(() => page.getByText('Preview is out of date.').count()).toBe(1)
  expect(await printSample.isDisabled()).toBe(true)

  const html = '<div class="flex flex-col"><span>{{order.number}}</span><span>{{fields.weight_kg}}</span><div class="flex">{{order.qrCode}}</div></div>'
  await page.getByTestId('open-ai').click()
  await page.getByTestId('answer-text').fill(JSON.stringify({ version: 1, name: 'CodeMirror by-weight slip', html }))
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

// Pilot plan §1, on a disposable fixture (not City Laundry's slip): Shirt from the list, placed in
// its box, then Shirt = 5 and a typed total of 7,000៛ in Test order, with no order made.
const PILOT_FIXTURE = [
  '<div class="flex h-full w-full flex-col bg-white p-4">',
  '  <span>{{order.number}}</span>',
  '  <div class="flex">{{order.qrCode}}</div>',
  '  <div class="flex flex-row border-2 border-black">',
  '    <span>Shirt</span>',
  '    <span>SHIRTBOX</span>',
  '  </div>',
  '  <div class="flex flex-row border-2 border-black">',
  '    <span>Total</span>',
  '    <span>{{order.total}}</span>',
  '  </div>',
  '</div>',
].join('\n')

it('places Shirt from the list in its box and checks it with Test order, creating nothing (pilot §1)', async () => {
  const page = await newDevice(browser, { width: 1440, height: 900 })
  onTestFailed(screenshotOnFailure('html-studio-pilot', [page]))
  await page.goto(`${host}/platform/templates`)
  await page.waitForURL(/\/sign-in/)
  await signIn(page, accounts.admin.username, accounts.admin.password)
  await page.waitForURL(`${host}/platform/templates`)
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() !== 'GET' && !request.url().endsWith('/api/platform/templates/preview')) writes.push(`${request.method()} ${request.url()}`)
  })
  await page.getByRole('link', { name: 'Create template' }).first().click()
  await page.waitForURL('**/platform/templates/new')
  const editor = page.getByTestId('html-source').locator('.cm-content')
  await editor.waitFor()
  await editor.fill(PILOT_FIXTURE)
  await page.getByTestId('html-ok').waitFor()

  // Add Shirt from the list: a count, not placed yet.
  await page.getByTestId('add-from-list').click()
  const itemList = page.getByRole('dialog', { name: 'Add from the item list' })
  await itemList.getByRole('checkbox', { name: 'Shirt', exact: true }).click()
  await itemList.getByTestId('item-add').click()
  await itemList.waitFor({ state: 'hidden' })
  await expect.poll(() => page.getByTestId('placement-shirt_count').textContent()).toBe('Not placed')
  expect(await page.getByTestId('placement-summary').textContent()).toContain('not placed')

  // Place it: select the Shirt box's stand-in, then Insert puts the placeholder there.
  const token = await editor.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent!.indexOf('SHIRTBOX')
      if (at < 0) continue
      const range = document.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + 'SHIRTBOX'.length)
      const box = range.getBoundingClientRect()
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    }
    throw new Error('No SHIRTBOX in the editor')
  })
  await page.mouse.dblclick(token.x, token.y)
  await page.getByTestId('insert-shirt_count').click()
  await expect.poll(() => editor.textContent()).toContain('<span>{{fields.shirt_count}}</span>')
  expect(await editor.textContent()).not.toContain('SHIRTBOX')
  await expect.poll(() => page.getByTestId('placement-shirt_count').textContent()).toBe('On the slip')

  // Test order: Shirt = 5 and a typed total, independent of the count.
  await page.getByTestId('fields-test-order').click()
  const test = page.getByRole('dialog', { name: 'Test order' })
  await test.getByTestId('html-custom-preview').getByRole('img').waitFor()
  const rendered = page.waitForResponse(response => response.url().endsWith('/api/platform/templates/preview')
    && response.request().postDataJSON().custom?.values.shirt_count === 5
    && response.request().postDataJSON().custom?.amount === 7000)
  await test.getByRole('spinbutton', { name: 'Shirt', exact: true }).fill('5')
  await test.getByRole('textbox', { name: 'Total', exact: true }).fill('7,000')
  expect((await rendered).ok()).toBe(true)
  await test.getByRole('button', { name: 'Show in preview' }).click()
  await test.waitFor({ state: 'hidden' })
  await expect.poll(() => page.getByRole('button', { name: 'Edit test order' }).count()).toBe(1)
  // Nothing was saved or created: no draft, no order.
  expect(writes).toEqual([])
})

it('keeps a required internal field off the slip, and a custom field doesn\'t block a list item (pilot §1 review)', async () => {
  const page = await newDevice(browser, { width: 1440, height: 900 })
  onTestFailed(screenshotOnFailure('html-studio-pilot-review', [page]))
  await page.goto(`${host}/platform/templates`)
  await page.waitForURL(/\/sign-in/)
  await signIn(page, accounts.admin.username, accounts.admin.password)
  await page.waitForURL(`${host}/platform/templates`)
  await page.getByRole('link', { name: 'Create template' }).first().click()
  await page.waitForURL('**/platform/templates/new')
  const editor = page.getByTestId('html-source').locator('.cm-content')
  await editor.waitFor()
  await editor.fill(PILOT_FIXTURE)
  await page.getByTestId('html-ok').waitFor()

  async function addTextField(label: string) {
    await page.getByTestId('new-field').click()
    await page.getByTestId('count-label').fill(label)
    await page.getByRole('combobox', { name: 'Field type' }).click()
    await page.getByRole('option', { name: 'Text', exact: true }).click()
    await page.getByTestId('add-count').click()
  }

  // Staff initials: Portal only, then Required. It stays off the slip and required for staff.
  await addTextField('Staff initials')
  await page.getByTestId('portal-only-staff_initials').click()
  await expect.poll(() => page.getByTestId('placement-staff_initials').textContent()).toBe('Portal only')
  await page.getByTestId('required-staff_initials').click()
  await expect.poll(() => page.getByTestId('required-staff_initials').getAttribute('aria-pressed')).toBe('true')
  expect(await page.getByTestId('placement-staff_initials').textContent()).toBe('Portal only')

  // A text field called Shirt count takes `shirt_count`, yet Shirt is still on the list.
  await addTextField('Shirt count')
  await expect.poll(() => page.getByTestId('field-shirt_count').count()).toBe(1)
  await page.getByTestId('add-from-list').click()
  const itemList = page.getByRole('dialog', { name: 'Add from the item list' })
  const shirt = itemList.getByRole('checkbox', { name: 'Shirt', exact: true })
  expect(await shirt.isDisabled()).toBe(false)
  await shirt.click()
  await itemList.getByTestId('item-add').click()
  await itemList.waitFor({ state: 'hidden' })
  // The list's Shirt count takes a suffix and is a count, apart from the text field.
  await expect.poll(() => page.getByTestId('field-shirt_count_2').count()).toBe(1)
  expect(await page.getByTestId('field-shirt_count_2').getByLabel('Whole number').count()).toBe(1)
  // Reopened, the picker knows Shirt is on the slip.
  await page.getByTestId('add-from-list').click()
  await itemList.waitFor()
  expect(await shirt.isDisabled()).toBe(true)
  expect(await shirt.isChecked()).toBe(true)
})

it('inserts a library image at the cursor, and the preview draws it (D41)', async () => {
  const page = await newDevice(browser, { width: 1440, height: 900 })
  onTestFailed(screenshotOnFailure('html-studio-image', [page]))
  await page.goto(`${host}/platform/templates`)
  await page.waitForURL(/\/sign-in/)
  await signIn(page, accounts.admin.username, accounts.admin.password)
  await page.waitForURL(`${host}/platform/templates`)
  await page.getByRole('link', { name: 'Create template' }).first().click()
  await page.waitForURL('**/platform/templates/new')
  const editor = page.getByTestId('html-source').locator('.cm-content')
  await editor.waitFor()
  // The server's preview SVGs, read in Node: the page reads them as blobs, which Playwright's
  // response events hand back empty.
  const previews: string[] = []
  await page.route('**/api/platform/templates/preview', async (route) => {
    const response = await route.fetch()
    const body = await response.text()
    if (response.ok()) previews.push(body)
    await route.fulfill({ response, body })
  })

  await editor.fill('<div class="flex flex-col p-4">\n<span>Linda</span>\n</div>')
  await editor.press('Control+Home')
  await editor.press('ArrowDown')
  await editor.press('End')
  await page.getByTestId('open-images').click()
  // An SVG file goes through the browser's PNG step, as artwork does.
  const logo = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#ff0000"/></svg>'
  await page.getByTestId('html-image-input').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(logo) })

  await expect.poll(() => editor.textContent()).toMatch(/<span>Linda<\/span><img src="image:[\da-f-]{36}" class="w-24"><\/div>/)
  await expect.poll(() => previews.some(svg => svg.includes('data:image/png;base64,'))).toBe(true)

  // The Images view stays open and lists it for the next one.
  await page.getByTestId('html-image-library').getByRole('button', { name: 'Insert logo.svg' }).waitFor()
})
