/**
 * The studio's keyboard (plan §5.5), as a pure map from a key press to an action, so it can be
 * tested without a browser. Space (pan) and Ctrl (no snapping) are held keys, handled by the canvas.
 */

export type ShortcutAction
  = | { kind: 'undo' | 'redo' | 'selectAll' | 'deselect' | 'delete' | 'duplicate' | 'copy' | 'paste' | 'zoomIn' | 'zoomOut' | 'fit' }
    | { kind: 'nudge', dx: number, dy: number }

interface KeyPress {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey?: boolean
}

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

/** The action for a key press, or `undefined` when the studio doesn't use it. Ctrl and ⌘ are the same. */
export function shortcutOf(event: KeyPress): ShortcutAction | undefined {
  const mod = event.ctrlKey || event.metaKey
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  if (mod) {
    if (key === 'z') return { kind: event.shiftKey ? 'redo' : 'undo' }
    if (key === 'y') return { kind: 'redo' }
    if (key === 'a') return { kind: 'selectAll' }
    if (key === 'd') return { kind: 'duplicate' }
    if (key === 'c') return { kind: 'copy' }
    if (key === 'v') return { kind: 'paste' }
    if (key === '+' || key === '=') return { kind: 'zoomIn' }
    if (key === '-' || key === '_') return { kind: 'zoomOut' }
    if (key === '0') return { kind: 'fit' }
    return undefined
  }
  if (key === 'Escape') return { kind: 'deselect' }
  if (key === 'Delete' || key === 'Backspace') return { kind: 'delete' }
  const arrow = ARROWS[key]
  if (arrow) {
    const step = event.shiftKey ? 10 : 1
    return { kind: 'nudge', dx: arrow[0] * step, dy: arrow[1] * step }
  }
  return undefined
}

/**
 * Shortcuts don't fire while typing in a field or editing text (plan §5.5), nor inside a dialog or a
 * menu, whose own keys (Escape closes it) come first.
 */
export function isTyping(event: { target: EventTarget | null }): boolean {
  const target = event.target as HTMLElement | null
  if (!target) return false
  if (target.closest?.('[role="dialog"], [role="alertdialog"], [role="menu"]')) return true
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.getAttribute?.('role') === 'combobox'
}
