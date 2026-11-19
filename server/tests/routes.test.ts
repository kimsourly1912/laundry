import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Deny by default (docs/server/security.md → Access helpers): every route under `/api/shop` and
 * `/api/platform` must call its surface's access helper. This finds a route that forgot. The
 * folders appear with their first routes (M1.4, M1.5); until then there is nothing to check.
 */
const SURFACES = [
  { dir: 'shop', helper: 'requireShopPermission(' },
  { dir: 'platform', helper: 'requirePlatformPermission(' },
]

const apiDir = fileURLToPath(new URL('../api', import.meta.url))

function routeFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .flatMap(entry => entry.isDirectory() ? routeFiles(join(dir, entry.name)) : entry.name.endsWith('.ts') ? [join(dir, entry.name)] : [])
}

/** Whether a route's source calls the helper (comments don't count). */
export function callsHelper(source: string, helper: string): boolean {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  return code.includes(helper)
}

describe('callsHelper', () => {
  it('finds a call, and not one that is only mentioned in a comment', () => {
    expect(callsHelper('const actor = await requireShopPermission(event, { order: [\'read\'] })', 'requireShopPermission(')).toBe(true)
    expect(callsHelper('// TODO requireShopPermission(event)\nreturn list()', 'requireShopPermission(')).toBe(false)
    expect(callsHelper('/* requireShopPermission( */ return list()', 'requireShopPermission(')).toBe(false)
  })
})

describe.each(SURFACES)('/api/$dir routes', ({ dir, helper }) => {
  const files = routeFiles(join(apiDir, dir))
  it.skipIf(!files.length)('are found', () => {
    expect(files.length).toBeGreaterThan(0)
  })
  it.each(files.map(file => [file.slice(apiDir.length + 1), file]))(`%s calls ${helper.slice(0, -1)}`, (_name, file) => {
    expect(callsHelper(readFileSync(file, 'utf8'), helper)).toBe(true)
  })
})

/**
 * The statements each platform route asks for (spec §9 → Platform). Only the super admin holds
 * platform statements today, so a route asking for too little would pass every behavior test: this
 * pins each route to the spec's table.
 */
const PLATFORM_STATEMENTS: Record<string, string> = {
  'platform/shops/index.get.ts': `{ shop: ['read'] }`,
  'platform/shops/index.post.ts': `{ shop: ['create'], owner: ['create'] }`,
  'platform/shops/[shopId].get.ts': `{ shop: ['read'] }`,
  'platform/shops/[shopId].patch.ts': `{ shop: ['update'] }`,
  'platform/shops/[shopId]/suspend.post.ts': `{ shop: ['suspend'] }`,
  'platform/shops/[shopId]/resume.post.ts': `{ shop: ['suspend'] }`,
  'platform/shops/[shopId]/owner/reset-password.post.ts': `{ owner: ['reset-password'] }`,
  'platform/shops/[shopId]/owner/revoke-sessions.post.ts': `{ owner: ['revoke-sessions'] }`,
  // The studio (plan S1): reading a template, its preview and images is `read`; changing them is `write`.
  'platform/templates/index.get.ts': `{ template: ['read'] }`,
  'platform/templates/index.post.ts': `{ template: ['write'] }`,
  'platform/templates/[id]/index.get.ts': `{ template: ['read'] }`,
  'platform/templates/[id]/index.patch.ts': `{ template: ['write'] }`,
  'platform/templates/[id]/publish.post.ts': `{ template: ['write'] }`,
  'platform/templates/[id]/preview.post.ts': `{ template: ['read'] }`,
  'platform/templates/preview.post.ts': `{ template: ['read'] }`,
  'platform/images/index.get.ts': `{ template: ['read'] }`,
  'platform/images/index.post.ts': `{ template: ['write'] }`,
  'platform/images/[id].get.ts': `{ template: ['read'] }`,
  // Step 2: archive and attachments. Attaching changes what a shop may use: it needs `shop: ['update']` too.
  'platform/templates/[id]/archive.post.ts': `{ template: ['write'] }`,
  'platform/templates/[id]/restore.post.ts': `{ template: ['write'] }`,
  'platform/templates/[id]/shops/index.get.ts': `{ template: ['read'], shop: ['read'] }`,
  'platform/templates/[id]/shops/index.post.ts': `{ template: ['write'], shop: ['update'] }`,
  'platform/templates/[id]/shops/[shopId].delete.ts': `{ template: ['write'], shop: ['update'] }`,
  'platform/shops/[shopId]/templates.get.ts': `{ shop: ['read'], template: ['read'] }`,
  'platform/shops/[shopId]/prices.get.ts': `{ shop: ['read'] }`,
  // D39: redesign requests, the platform's queue.
  'platform/template-requests/index.get.ts': `{ template: ['read'] }`,
  'platform/template-requests/[id]/index.get.ts': `{ template: ['read'] }`,
  'platform/template-requests/[id]/photo.get.ts': `{ template: ['read'] }`,
  'platform/template-requests/[id]/status.post.ts': `{ template: ['write'] }`,
}

/**
 * The same for the shop's routes (spec §9 → Shop): the owner holds every shop statement, so only
 * this table tells one statement from another until staff exist (P3).
 */
const SHOP_STATEMENTS: Record<string, string> = {
  'shop/settings.get.ts': `{ shop: ['read'] }`,
  'shop/settings.patch.ts': `{ shop: ['update'] }`,
  // The owner portal (plan step 3): templates to fill, and orders.
  'shop/templates/index.get.ts': `{ template: ['read'] }`,
  'shop/templates/[id]/images/[imageId].get.ts': `{ template: ['read'] }`,
  'shop/templates/[id]/default.post.ts': `{ template: ['set-default'] }`,
  'shop/orders/index.post.ts': `{ order: ['create'] }`,
  'shop/orders/index.get.ts': `{ order: ['read'] }`,
  'shop/orders/[id]/index.get.ts': `{ order: ['read'] }`,
  'shop/orders/[id]/images/[imageId].get.ts': `{ order: ['read'] }`,
  'shop/orders/[id]/payment.post.ts': `{ order: ['pay'] }`,
  'shop/orders/[id]/pick-up.post.ts': `{ order: ['pick-up'] }`,
  'shop/orders/[id]/cancel.post.ts': `{ order: ['cancel'] }`,
  'shop/orders/[id]/telegram.post.ts': `{ order: ['share'] }`,
  'shop/orders/[id]/start.post.ts': `{ order: ['work'] }`,
  'shop/orders/[id]/ready.post.ts': `{ order: ['work'] }`,
  'shop/orders/[id]/rework.post.ts': `{ order: ['work'] }`,
  'shop/orders/overview.get.ts': `{ order: ['read'] }`,
  'shop/orders/preview.post.ts': `{ order: ['create'] }`,
  'shop/orders/[id]/slip.get.ts': `{ order: ['read'] }`,
  'shop/customers/index.get.ts': `{ customer: ['read'] }`,
  'shop/customers/index.post.ts': `{ customer: ['write'] }`,
  'shop/customers/[id].get.ts': `{ customer: ['read'] }`,
  'shop/customers/[id].patch.ts': `{ customer: ['write'] }`,
  'shop/prices/index.get.ts': `{ price: ['read'] }`,
  'shop/template-requests/index.get.ts': `{ template: ['request'] }`,
  'shop/template-requests/index.post.ts': `{ template: ['request'] }`,
  'shop/template-requests/[id]/photo.get.ts': `{ template: ['request'] }`,
  'shop/prices/[key].put.ts': `{ price: ['write'] }`,
}

describe.each([
  { surface: 'platform', helper: 'requirePlatformPermission', table: PLATFORM_STATEMENTS },
  { surface: 'shop', helper: 'requireShopPermission', table: SHOP_STATEMENTS },
])('$surface routes ask for the spec\'s statements', ({ surface, helper, table }) => {
  const files = routeFiles(join(apiDir, surface)).map(file => file.slice(apiDir.length + 1).replaceAll('\\', '/'))
  it('every route is in the table', () => {
    expect(files.sort()).toEqual(Object.keys(table).sort())
  })
  it.each(Object.entries(table))('%s asks for %s', (file, statements) => {
    expect(readFileSync(join(apiDir, file), 'utf8')).toContain(`${helper}(event, ${statements})`)
  })
})
