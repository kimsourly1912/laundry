/**
 * The studio's autosave (plan §5.8), without Vue: a change is saved about a second after the last
 * one, one save at a time, each sending the version the previous save answered. A change made while
 * a save runs is saved after it. A stale version (409 `VERSION_CONFLICT`) stops saving for good:
 * the studio asks the person to reload. Any other failure waits for `retry()` or the next change.
 */

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'failed' | 'conflict'

export interface SaveResult {
  version: number
}

interface DraftSaverOptions<T> {
  /** The template's version as loaded. */
  version: number
  /** Sends the change at `version`; resolves to the new version, rejects on failure. */
  save: (change: T, version: number) => Promise<SaveResult>
  /** Whether a rejection is a stale version. */
  isConflict: (error: unknown) => boolean
  onStatus: (status: SaveStatus) => void
  /** How long a change waits for the next one, in ms. */
  delay?: number
}

export interface DraftSaver<T> {
  /** A new change replaces any unsaved one: changes are whole (the design and the name). */
  change: (change: T) => void
  /** Saves now what's waiting, and resolves when nothing is left to save (or saving stopped). */
  flush: () => Promise<void>
  /** Tries the failed save again. */
  retry: () => void
  /**
   * The template moved to `version` by another action of this studio (Publish), with nothing left
   * to save: call it after `flush()`.
   */
  setVersion: (version: number) => void
  /** Stops the timer (the studio closed). */
  dispose: () => void
  status: () => SaveStatus
  version: () => number
}

export function createDraftSaver<T>(options: DraftSaverOptions<T>): DraftSaver<T> {
  const { save, isConflict, onStatus, delay = 1000 } = options
  let version = options.version
  let waiting: { change: T } | undefined
  let status: SaveStatus = 'saved'
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<void> | undefined

  function setStatus(next: SaveStatus) {
    if (status === next) return
    status = next
    onStatus(next)
  }

  async function run(): Promise<void> {
    while (waiting && status !== 'conflict') {
      const { change } = waiting
      waiting = undefined
      setStatus('saving')
      try {
        version = (await save(change, version)).version
      }
      catch (error) {
        if (isConflict(error)) {
          setStatus('conflict')
          return
        }
        // Keep the change unless a newer one arrived meanwhile.
        waiting ??= { change }
        setStatus('failed')
        return
      }
    }
    if (status === 'saving') setStatus(waiting ? 'pending' : 'saved')
  }

  function start(): Promise<void> {
    clearTimeout(timer)
    timer = undefined
    running ??= run().finally(() => {
      running = undefined
    })
    return running
  }

  function change(next: T) {
    if (status === 'conflict') return
    waiting = { change: next }
    // A new change after a failure is a new try.
    if (status !== 'saving') setStatus('pending')
    clearTimeout(timer)
    timer = setTimeout(() => {
      // A save in flight picks the change up when it finishes.
      if (!running) void start()
    }, delay)
  }

  async function flush(): Promise<void> {
    while (running) await running
    if (waiting && status !== 'conflict') await start()
  }

  function retry() {
    if (status !== 'failed' || !waiting) return
    setStatus('pending')
    void start()
  }

  function setVersion(next: number) {
    version = next
  }

  return {
    change,
    flush,
    retry,
    setVersion,
    dispose: () => clearTimeout(timer),
    status: () => status,
    version: () => version,
  }
}
