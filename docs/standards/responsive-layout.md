# Responsive layout

← [Docs](../README.md) · Visual rules: [ui.md](./ui.md) · Patterns: [page-patterns.md](./page-patterns.md) · Review: [ui-review-checklist.md](./ui-review-checklist.md)

How screens adapt to width. **Compact first:** the main device is a phone at the shop counter, held in one hand, often by someone in a hurry. Wider screens (a tablet, the platform admin's laptop) get the same product with more room.

---

## 1. Width classes

| Class | Viewport width | Tailwind variant | Typical use |
|---|---|---|---|
| **Compact** | < 640px | unprefixed (mobile first), `max-sm:` | Phones: every shop screen is designed here first |
| **Medium** | 640–1023px | `sm:` … `max-lg:` | Tablets, small laptop windows |
| **Expanded** | ≥ 1024px | `lg:` | Laptops: the platform console mostly |

- **Width-based, never device-based.** Decide with `sm` and `lg`. Never use the user agent, `pointer`/`hover` media queries or "is mobile" checks to change layout or capability.
- **These are the only layout breakpoints.** `md:`/`xl:` may tune spacing or columns inside a class, never what the user can do. No arbitrary breakpoints.
- **Why 1024px:** `UDashboardSidebar` becomes persistent at `lg`; the shell and page layouts switch together.
- **Same product at every width.** Capabilities, permissions, data, validation and URLs are identical. A phone may move an action into a menu or sheet, never remove it.

### Constrained surfaces: container queries

A slideover or a narrow column is narrower than the viewport. Its **contents** follow the surface's width: put `@container` on the surface's body, write the content mobile first, and add wider layouts with Tailwind's default container variants (`@md:`, `@lg:`). No arbitrary `@[500px]:` values.

A choice made in JavaScript (a dropdown vs a bottom sheet, `fullscreen` on a modal) comes from the viewport through **one shared composable**, built with the first screen that needs one (no screen does yet). Components never call `useMediaQuery` themselves or measure their own width.

## 2. Compact is designed, not shrunk

A compact screen is a focused touch workflow: one task per screen, the main content first, actions in thumb reach. Stacking the desktop layout in one column is not a compact design. Before building a compact screen, answer:

1. What is the one thing the owner does here, standing at the counter? Put it first.
2. Which parts become separate steps or screens rather than stacked sections?
3. Which controls move into a sheet (filters, row actions), so the list stays visible?
4. Where is the primary action: the navbar, or a bottom bar in thumb reach?

Counter realities to design for: one hand busy (holding clothes or cash), a customer waiting, bright light, a cheap Android phone, a slow connection.

## 3. Application shell

Nuxt UI's dashboard: `UDashboardGroup` → `UDashboardSidebar` + one `UDashboardPanel` per page. Three layouts: **auth** (sign-in, change password, the "unavailable" notice), **shop**, **platform**, the last two around `components/AppShell.vue` ([app-shell](../reference/app-shell.md)).

| | Compact | Medium | Expanded |
|---|---|---|---|
| Sidebar | Drawer, opened from the navbar's menu button | Drawer | Persistent, collapsible |
| Page | Full width | Full width | Beside the sidebar |

The public ticket page `/t/:token` has no shell: one column, mobile only, server-rendered.

## 4. Navigation

- **Compact and medium:** `UDashboardNavbar` is the app bar (menu button, page title, the page's one primary action). The drawer holds the full navigation.
- **Bottom navigation:** not by default. The shop has about 6 destinations (Today, Orders, Pickup, Customers, Prices, Settings). Whether Today / New order / Pickup become a bottom bar is decided with the first real shop (after M2.3), from how the owner actually moves. Until then: drawer only.
- **One source for navigation:** each feature's `navigation.ts`, collected by the layout, so every width has the same destinations in the same order.
- **Detail routes** show a Back button to their index. Back returns to the index in history when the user came from it (filters in the URL survive), otherwise to the index route.

## 5. Page anatomy

```
UDashboardPanel
├─ #header
│  ├─ UDashboardNavbar      title · menu button · right: the ONE primary action
│  └─ UDashboardToolbar     optional: search · filters
├─ #body                     status tabs · alerts for the whole page · content
└─ bottom bar                optional, compact/medium: the step's or draft's primary action
```

- **Navbar primary action:** labelled at every width. Icon-only (with `aria-label`) only when the label can't fit at 320px.
- **Toolbars never scroll sideways.** On a phone, search takes its own full line; filters wrap below. More than two filters → one **Filters** button (with the active count) opening a bottom sheet with Clear and Apply, writing the same URL query.
- **Body order:** tabs → page-wide alerts (suspended, conflict) → content. An alert about one row sits on that row.
- **One bottom bar at a time.** Below `lg` it's fixed to the bottom, full width, with `env(safe-area-inset-bottom)` padding, and the page body gets matching bottom padding. It holds ordinary Nuxt UI buttons. Overlays use their own footer, not this bar. The shared component comes with the first task flow that needs it (M2.3 new order).

## 6. Sticky and fixed elements

Sticky or fixed controls never cover the focused field or the last content:
- The panel body has bottom padding equal to the bar while a bar shows.
- The scroll container has matching `scroll-pb-*`, so keyboard focus is never hidden behind a bar (WCAG 2.4.11).
- **The on-screen keyboard:** a task flow's primary action stays above the keyboard. In full-screen overlays, Save sits in the overlay footer.
- Only the navbar and toolbar stick to the top.

## 7. Responsive behavior matrix

| Element | Expanded ≥1024 | Medium 640–1023 | Compact <640 |
|---|---|---|---|
| Navigation | Persistent sidebar | Drawer | Drawer |
| Detail navigation | Breadcrumb or Back | Back + title | Back + title |
| Primary action | Navbar, labelled | Navbar, labelled | Navbar or bottom bar |
| Search | Toolbar, fixed width | Toolbar | Toolbar, full line |
| Filters (>2) | Toolbar | Toolbar | Filters button → bottom sheet |
| Comparable columns | `UTable` | `UTable` if it fits, else rows | **Rows; never a sideways-scrolling table** |
| Row actions | `⋮` dropdown | `⋮` dropdown | `⋮` dropdown or bottom sheet |
| Short form | `UModal` | `UModal` | Full-screen `UModal` |
| Task flow | Centered card | Centered card | Full screen, action at the bottom |
| Settings | Sections, one Save | Same | Same sections, one Save in a bottom bar |
| Confirmation | Centered dialog | Centered dialog | Centered dialog |

## 8. Reflow, zoom and orientation

- Content reflows to 320 CSS px (WCAG 1.4.10): no two-dimensional scrolling.
- 200% text zoom stays readable; text containers have no fixed heights. Khmer text is taller than Latin text: leave room ([i18n §3](./i18n.md#3-khmer-type)).
- A landscape phone under 640px wide is compact; wider is medium.
