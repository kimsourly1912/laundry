import { describe, expect, it } from 'vitest'
import { isTyping, shortcutOf } from '../utils/shortcuts'

const press = (key: string, mods: { ctrl?: boolean, meta?: boolean, shift?: boolean } = {}) =>
  shortcutOf({ key, ctrlKey: Boolean(mods.ctrl), metaKey: Boolean(mods.meta), shiftKey: Boolean(mods.shift) })

describe('shortcutOf (plan §5.7)', () => {
  it('maps editing, selecting, layers and zoom keys, Ctrl or ⌘', () => {
    expect(press('z', { ctrl: true })).toEqual({ kind: 'undo' })
    expect(press('Z', { meta: true, shift: true })).toEqual({ kind: 'redo' })
    expect(press('y', { ctrl: true })).toEqual({ kind: 'redo' })
    expect(press('a', { ctrl: true })).toEqual({ kind: 'selectAll' })
    expect(press('d', { ctrl: true })).toEqual({ kind: 'duplicate' })
    expect(press(']', { ctrl: true })).toEqual({ kind: 'layer', move: 'forward' })
    expect(press('[', { ctrl: true })).toEqual({ kind: 'layer', move: 'backward' })
    expect(press('=', { ctrl: true })).toEqual({ kind: 'zoomIn' })
    expect(press('-', { ctrl: true })).toEqual({ kind: 'zoomOut' })
    expect(press('0', { ctrl: true })).toEqual({ kind: 'fit' })
    expect(press('Delete')).toEqual({ kind: 'delete' })
    expect(press('Backspace')).toEqual({ kind: 'delete' })
    expect(press('Escape')).toEqual({ kind: 'deselect' })
  })

  it('nudges 1 px, or 10 px with Shift, and ignores other keys', () => {
    expect(press('ArrowLeft')).toEqual({ kind: 'nudge', dx: -1, dy: 0 })
    expect(press('ArrowDown', { shift: true })).toEqual({ kind: 'nudge', dx: 0, dy: 10 })
    expect(press('x')).toBeUndefined()
    expect(press('q', { ctrl: true })).toBeUndefined()
  })

  it('knows when the person is typing', () => {
    const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ target: { tagName, isContentEditable: false, getAttribute: () => null, closest: () => null, ...extra } as unknown as EventTarget })
    expect(isTyping(el('INPUT'))).toBe(true)
    expect(isTyping(el('TEXTAREA'))).toBe(true)
    expect(isTyping(el('DIV', { isContentEditable: true }))).toBe(true)
    expect(isTyping(el('DIV'))).toBe(false)
    expect(isTyping(el('BUTTON', { closest: () => ({}) }))).toBe(true)
  })
})
