import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// docs/standards/i18n.md → Strings: every string is in en.json and km.json; a key missing from one
// file, or used in code but missing from both, fails here.

const appDir = fileURLToPath(new URL('../../app', import.meta.url))
const load = (code: string) => JSON.parse(readFileSync(join(appDir, 'locales', `${code}.json`), 'utf8'))

function flatten(tree: Record<string, unknown>, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'object' && value !== null) for (const [k, v] of flatten(value as Record<string, unknown>, `${prefix}${key}.`)) out.set(k, v)
    else out.set(`${prefix}${key}`, String(value))
  }
  return out
}

const en = flatten(load('en'))
const km = flatten(load('km'))
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'tests' || name === 'locales' ? [] : sourceFiles(path)
    return /\.(vue|ts)$/.test(name) ? [path] : []
  })
}

/** Keys written literally in code: `t('a.b')`, `label: 'a.b'` in navigation, `title: 'a.b'` in page meta. */
function usedKeys(): Set<string> {
  const keys = new Set<string>()
  for (const file of sourceFiles(appDir)) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/\bt\(\s*'([\w.]+)'/g)) keys.add(match[1]!)
    for (const match of source.matchAll(/\b(?:label|title): '([a-z]\w*(?:\.\w+)+)'/g)) keys.add(match[1]!)
  }
  return keys
}

/** The studio is English only (D33): its strings may be missing from km.json, which falls back to English. */
const ENGLISH_ONLY = 'studio.'

describe('locales', () => {
  it('en and km have the same keys, but the studio\'s', () => {
    expect([...km.keys()].filter(key => !en.has(key))).toEqual([])
    expect([...en.keys()].filter(key => !km.has(key) && !key.startsWith(ENGLISH_ONLY))).toEqual([])
  })

  it('no empty text', () => {
    expect([...en, ...km].filter(([, text]) => !text.trim()).map(([key]) => key)).toEqual([])
  })

  it('the same placeholders and plural forms in both languages', () => {
    for (const [key, text] of en) {
      if (!km.has(key)) continue
      expect(placeholders(km.get(key) ?? ''), key).toEqual(placeholders(text))
      expect((km.get(key) ?? '').split('|').length, key).toBe(text.split('|').length)
    }
  })

  it('every key the code names exists', () => {
    expect([...usedKeys()].filter(key => !en.has(key))).toEqual([])
  })
})
