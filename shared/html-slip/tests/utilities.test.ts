import { readFileSync } from 'node:fs'
import satori from 'satori'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isKnownUtility } from '#shared/html-slip/catalog'
import { UTILITY_SUGGESTIONS } from '#shared/html-slip/utilities'

// The Studio suggests only classes the checker accepts and Satori draws.

const font = readFileSync(new URL('../../../server/features/templates/fonts/NotoSansKhmer-Regular.ttf', import.meta.url))

/** Satori's complaints about one class: its Tailwind warns on the console for one it can't read. */
async function complaints(name: string): Promise<string[]> {
  const found: string[] = []
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => found.push(args.join(' ')))
  // `leading-*` and `tracking-*` are relative to the text size, so they get one beside them.
  const tw = /^(?:leading|tracking)-/.test(name) ? `text-base ${name}` : name
  await satori({ type: 'div', props: { style: { display: 'flex' }, children: [{ type: 'div', props: { tw, children: 'Slip' } }] } } as never, {
    width: 120,
    height: 40,
    fonts: [{ name: 'Slip', data: font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength) as ArrayBuffer, weight: 400, style: 'normal' }],
    onStyleError: error => found.push(error.message),
  })
  return found
}

describe('utility suggestions', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists each class once, all accepted by the checker', () => {
    expect(new Set(UTILITY_SUGGESTIONS).size).toBe(UTILITY_SUGGESTIONS.length)
    expect(UTILITY_SUGGESTIONS.filter(name => !isKnownUtility(name))).toEqual([])
  })

  it('offers stock colours, not the app\'s own names', () => {
    expect(UTILITY_SUGGESTIONS).toContain('text-sky-700')
    expect(UTILITY_SUGGESTIONS).not.toContain('text-primary')
  })

  it('draws every one in Satori', async () => {
    const rejected: string[] = []
    for (const name of UTILITY_SUGGESTIONS) {
      if ((await complaints(name)).length) rejected.push(name)
    }
    expect(rejected).toEqual([])
  }, 120_000)
})
