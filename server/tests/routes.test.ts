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
