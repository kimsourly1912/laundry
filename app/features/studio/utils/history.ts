/**
 * Undo and redo for the studio (plan §5.8, §6.5): snapshots of the whole design (it's small), kept
 * as JSON text. A gesture (one drag, one resize) commits one snapshot when it ends. The last
 * `limit` changes of this session are kept.
 */

export interface History {
  /** Records `snapshot` as the current state; `false` when nothing changed. Clears redo. */
  commit: (snapshot: string) => boolean
  /** The state before the current one, which becomes current; `undefined` at the start. */
  undo: () => string | undefined
  redo: () => string | undefined
  canUndo: () => boolean
  canRedo: () => boolean
  current: () => string
}

export function createHistory(initial: string, limit = 100): History {
  const past: string[] = []
  const future: string[] = []
  let current = initial

  function commit(snapshot: string): boolean {
    if (snapshot === current) return false
    past.push(current)
    if (past.length > limit) past.shift()
    future.length = 0
    current = snapshot
    return true
  }

  function undo(): string | undefined {
    const previous = past.pop()
    if (previous === undefined) return undefined
    future.push(current)
    current = previous
    return current
  }

  function redo(): string | undefined {
    const next = future.pop()
    if (next === undefined) return undefined
    past.push(current)
    current = next
    return current
  }

  return { commit, undo, redo, canUndo: () => past.length > 0, canRedo: () => future.length > 0, current: () => current }
}
