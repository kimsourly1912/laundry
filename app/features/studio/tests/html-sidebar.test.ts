import { describe, expect, it } from 'vitest'
import { pickSidebarView } from '../utils/html-sidebar'

describe('pickSidebarView (the activity bar, as in VS Code)', () => {
  it('closes the sidebar when the open view is picked again', () => {
    expect(pickSidebarView({ view: 'fields', open: true }, 'fields')).toEqual({ view: 'fields', open: false })
  })

  it('switches to another view and keeps the sidebar open', () => {
    expect(pickSidebarView({ view: 'fields', open: true }, 'images')).toEqual({ view: 'images', open: true })
  })

  it('opens a closed sidebar on the picked view, the last one too', () => {
    expect(pickSidebarView({ view: 'fields', open: false }, 'fields')).toEqual({ view: 'fields', open: true })
    expect(pickSidebarView({ view: 'fields', open: false }, 'paper')).toEqual({ view: 'paper', open: true })
  })
})
