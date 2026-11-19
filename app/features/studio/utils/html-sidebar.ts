/**
 * The HTML Studio's activity bar, as in VS Code: one icon per sidebar view. The main views sit at the
 * top; settings-like views at the bottom. Labels are `studio.html.sidebar.views.<value>`.
 */
export const SIDEBAR_VIEWS = [
  { value: 'fields', icon: 'i-lucide-sliders-horizontal', place: 'top' },
  { value: 'presets', icon: 'i-lucide-layout-template', place: 'top' },
  { value: 'images', icon: 'i-lucide-images', place: 'top' },
  { value: 'ai', icon: 'i-lucide-sparkles', place: 'top' },
  { value: 'paper', icon: 'i-lucide-ruler', place: 'bottom' },
] as const

export type SidebarView = typeof SIDEBAR_VIEWS[number]['value']

export interface SidebarState {
  view: SidebarView
  open: boolean
}

/**
 * VS Code's rule for a click on an activity icon: the open view's icon closes the sidebar; any
 * other icon opens the sidebar on its view.
 */
export function pickSidebarView(state: SidebarState, view: SidebarView): SidebarState {
  if (state.open && state.view === view) return { view, open: false }
  return { view, open: true }
}
