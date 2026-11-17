import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDraftSaver } from '../utils/draft-saver'
import type { SaveStatus } from '../utils/draft-saver'

// The studio's autosave (plan §5.8): about a second after the last change, one save at a time,
// each at the version the last one answered; a stale version stops it.

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

function setup(options: { fail?: (change: string) => 'conflict' | 'error' | undefined } = {}) {
  const saves: [string, number][] = []
  const statuses: SaveStatus[] = []
  let finish: (() => void) | undefined
  let hold = false
  const saver = createDraftSaver<string>({
    version: 1,
    delay: 1000,
    save: async (change, version) => {
      saves.push([change, version])
      if (hold) await new Promise<void>(resolve => (finish = resolve))
      const failure = options.fail?.(change)
      if (failure) throw new Error(failure)
      return { version: version + 1 }
    },
    isConflict: error => (error as Error).message === 'conflict',
    onStatus: status => statuses.push(status),
  })
  return { saver, saves, statuses, holdSaves: () => (hold = true), finishSave: () => finish?.() }
}

describe('createDraftSaver', () => {
  it('saves the last change a second after it, at the version the previous save answered', async () => {
    const { saver, saves, statuses } = setup()
    saver.change('a')
    await vi.advanceTimersByTimeAsync(500)
    saver.change('b')
    await vi.advanceTimersByTimeAsync(999)
    expect(saves).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    saver.change('c')
    await vi.advanceTimersByTimeAsync(1000)
    expect(saves).toEqual([['b', 1], ['c', 2]])
    expect(saver.version()).toBe(3)
    expect(statuses).toEqual(['pending', 'saving', 'saved', 'pending', 'saving', 'saved'])
  })

  it('saves a change made during a save right after it, never two at once', async () => {
    const { saver, saves, holdSaves, finishSave } = setup()
    holdSaves()
    saver.change('a')
    await vi.advanceTimersByTimeAsync(1000)
    saver.change('b')
    await vi.advanceTimersByTimeAsync(5000)
    expect(saves).toEqual([['a', 1]])
    finishSave()
    await vi.advanceTimersByTimeAsync(0)
    expect(saves).toEqual([['a', 1], ['b', 2]])
    finishSave()
    await vi.advanceTimersByTimeAsync(0)
    expect(saver.status()).toBe('saved')
  })

  it('stops for good on a stale version', async () => {
    const { saver, saves } = setup({ fail: () => 'conflict' })
    saver.change('a')
    await vi.advanceTimersByTimeAsync(1000)
    expect(saver.status()).toBe('conflict')
    saver.change('b')
    saver.retry()
    await saver.flush()
    await vi.advanceTimersByTimeAsync(5000)
    expect(saves).toEqual([['a', 1]])
  })

  it('keeps a failed change for Retry or the next change', async () => {
    let failing = true
    const { saver, saves } = setup({ fail: () => (failing ? 'error' : undefined) })
    saver.change('a')
    await vi.advanceTimersByTimeAsync(1000)
    expect(saver.status()).toBe('failed')
    failing = false
    saver.retry()
    await vi.advanceTimersByTimeAsync(0)
    expect(saves).toEqual([['a', 1], ['a', 1]])
    expect(saver.status()).toBe('saved')
  })

  it('saves what waits at once on flush', async () => {
    const { saver, saves } = setup()
    saver.change('a')
    await saver.flush()
    expect(saves).toEqual([['a', 1]])
    expect(saver.status()).toBe('saved')
  })
})
