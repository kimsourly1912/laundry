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
  'platform/images/index.get.ts': `{ template: ['read'] }`,
  'platform/images/index.post.ts': `{ template: ['write'] }`,
  'platform/images/[id].get.ts': `{ template: ['read'] }`,
}

/**
 * The same for the shop's routes (spec §9 → Shop): the owner holds every shop statement, so only
 * this table tells one statement from another until staff exist (P3).
 */
const SHOP_STATEMENTS: Record<string, string> = {
  'shop/settings.get.ts': `{ shop: ['read'] }`,
  'shop/settings.patch.ts': `{ shop: ['update'] }`,
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
