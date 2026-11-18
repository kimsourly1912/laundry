# UI foundation

← [Docs](../README.md) · Layout: [responsive-layout.md](./responsive-layout.md) · Patterns: [page-patterns.md](./page-patterns.md) · Review: [ui-review-checklist.md](./ui-review-checklist.md) · Language and type: [i18n.md](./i18n.md)

The visual rules for every screen: tokens, spacing, type, touch, icons, surfaces, actions, status, behavior and accessibility. Where a rule lives here, other pages link to it.

> **Nuxt UI is the component design system. Tailwind tokens are the layout and styling language.** Every screen is built from Nuxt UI components, configured globally in `app/app.config.ts`, and laid out with Tailwind's standard utilities. There is no second component library and no custom visual language on top.

The main device is **a phone at the shop counter** ([responsive-layout](./responsive-layout.md)). Design for one hand, a busy owner and bad light.

---

## 1. Principles

1. **Nuxt UI first.** Use Nuxt UI components with their default sizes, variants and slots. Check the component's docs for the installed version before using it.
2. **Configure globally, never per page.** Colors, radius, default sizes and component defaults change only in `app/app.config.ts` (`ui.colors`, a component's `slots`, `variants`, `defaultVariants`). Nuxt UI theme variables (`--ui-primary`, `--ui-radius`) are set once in `app/assets/css/tailwind.css`. A page never restyles a component: no per-page `ui` override of color, size, radius or shadow.
3. **No parallel component library.** Shared app components wrap **behavior** (an empty state, a bottom bar, a money display). They don't re-skin Nuxt UI. Don't create `AppButton`, `BaseCard` or a styled row component.
4. **Tailwind tokens only.** Standard scales for spacing (`gap-4`), breakpoints (`sm:`, `lg:`), container queries (`@container`, `@md:`), sizing (`size-5`, `max-w-md`), type (`text-sm`) and Nuxt UI's semantic colors (`text-muted`, `bg-elevated`, `border-default`). **No arbitrary values** (`[13px]`, `min-[700px]:`), no hex colors, no palette classes (`bg-sky-500`).
5. **Layout-only tweaks are allowed on a component:** grid/flex placement, `min-w-0`, `shrink`, `break-words`, visibility per width, and a `ui` slot class that changes layout only. Anything that changes color, size, radius or shadow belongs in `app.config.ts`.
6. **Custom CSS is limited** to theme variables, the Khmer font setup ([i18n §3](./i18n.md#3-khmer-type)), safe-area handling (`env(safe-area-inset-*)`) and behavior utilities can't express.
7. **Avoid:** decorative gradients, glass and blur effects, custom shadows, too many pills, one-off styling.

## 2. Color tokens

The palette is set once in `app.config.ts` (`primary`, `neutral`). Laundry's colors are not chosen yet; changing them is a one-line change there. Use **semantic** colors only.

| Role | Use |
|---|---|
| Primary | The one main action, the current navigation item, selected state |
| Neutral | Everything else: secondary buttons, badges without meaning |
| Success | Done, ready, paid, saved |
| Warning | Needs attention: unpaid, not collected, a conflict the user can resolve |
| Error | Failures, validation, destructive actions |
| Info | Neutral notices (rare; prefer a muted sentence) |

| Text | Use |
|---|---|
| `text-highlighted` | Headings, names, the main value in a row (an order number, a total) |
| `text-default` | Body text |
| `text-muted` | Supporting text, meta lines, help |
| `text-dimmed` | Placeholders and disabled-looking content only |

Surfaces: `bg-default` for the page, cards and overlays; `bg-elevated` (`/25`–`/50`) for a quiet grouped area or a number's card. Borders: `border-default`, `divide-default` between rows.

- **A role keeps its meaning app-wide.** A screen never uses `warning` for decoration or `primary` for emphasis.
- **Color is never the only signal.** Status also has text (§10).
- **Light and dark mode both work.** Everything uses semantic tokens. Light by default; the user can switch.
- **Contrast is measured** when the palette is chosen: light-mode text shades of each semantic color may need a darker `--ui-<color>` in `tailwind.css` to reach 4.5:1 (NUK needed this for amber, warning, success, error and info).

## 3. Spacing

Tailwind's 4px scale: `1` (4px), `2`, `3`, `4`, `5`, `6`, `8`, `10`, `12`, `16`. Half steps only inside a compact control or badge.

| Between… | Space |
|---|---|
| Icon and its text; items in a chip row | `gap-1`–`gap-2` |
| Controls in a toolbar or form row | `gap-2`–`gap-3` |
| Fields in a form | `space-y-4` (the `UForm` default) |
| Sections of a page or card | `space-y-6` / `gap-6` |
| Page gutter, card padding | Nuxt UI's defaults; don't add more |

## 4. Radius

Use Nuxt UI's `--ui-radius`. Don't set `rounded-*` on Nuxt UI components. Plain elements the app draws use `rounded-md` / `rounded-lg`, or `rounded-full` for dots and avatars.

## 5. Typography

| Level | Style | Where |
|---|---|---|
| Page title | `UDashboardNavbar` `title` | One per page |
| Record title on a detail page | `text-xl font-semibold text-highlighted` (`h2`) | Order #61, a template's name |
| Section heading | `font-semibold text-highlighted` (`h2`/`h3`) | Card and form sections |
| Body | `text-sm` | Lists, forms |
| Supporting | `text-sm text-muted` | Meta lines, help |
| Small meta | `text-xs text-muted` | Counts, "3 days ago" |

- At most three sizes on one screen. Numbers, money and times use `tabular-nums`.
- Khmer needs more line height than Latin text and its own font: [i18n §3](./i18n.md#3-khmer-type).
- Long names wrap (`break-words`); truncate only where the full value is one tap away.
- Headings follow document order (`h1` → `h2` → `h3`).
- English copy: sentence case, verbs on buttons ("Mark ready", "Record payment"), no ALL CAPS.

## 6. Density and touch targets

- **Nuxt UI's default sizes at every width.** Don't make controls bigger for phones with `min-h-*`, `min-w-*` or size props. WCAG 2.2 AA's 24×24px minimum is the floor, and Nuxt UI's defaults meet it. A size change is a theme change in `app.config.ts`.
- **Checkboxes, radios and switches** may get a larger **invisible** hit area below `sm`, set once in `app.config.ts`.
- **Make a target large by its content:** a record's row is one link holding its name and meta line, which is naturally 44px or taller ([page-patterns → Row composition](./page-patterns.md#row-composition)).
- **A choice among a few options** (service type, paid / not paid) is a `variant="card"` `URadioGroup`: the whole row is the target.
- Adjacent targets keep at least `gap-2` between them.
- **Quantities and weights** use a control that opens the right keyboard (`inputmode="decimal"` for kg, a stepper for pieces). Decided with the first order form (M2.3).

## 7. Icons

- **Lucide only**, bundled at build time (`icon.provider: 'none'`). Write names as literal strings (`'i-lucide-plus'`) so the bundler finds them.
- `size-4` inline with text, `size-5` alone. Icon-only buttons need an `aria-label` (and a tooltip on wide screens).
- **One icon per concept**, app-wide:

| Concept | Icon | Concept | Icon |
|---|---|---|---|
| Create | `i-lucide-plus` | Row actions | `i-lucide-ellipsis-vertical` |
| Edit | `i-lucide-pencil` | Search | `i-lucide-search` |
| Archive | `i-lucide-archive` | Restore | `i-lucide-archive-restore` |
| Back | `i-lucide-arrow-left` | Scan slip | `i-lucide-scan-line` |
| Phone | `i-lucide-phone` | Telegram linked | `i-lucide-send` |
| Payment | `i-lucide-banknote` | Ready | `i-lucide-check` |
| Error | `i-lucide-circle-alert` | Info | `i-lucide-info` |
| Busy | `i-lucide-loader-circle` (spinning) | Time | `i-lucide-clock` |

A feature's own icon is the one in its `navigation.ts`.

## 8. Surfaces

From the page outwards:
1. **Page** (`UDashboardPanel` body, `bg-default`).
2. **Section:** a heading plus content, separated by space or `USeparator`. Prefer sections to boxes.
3. **Card** (`UCard` outline): one record in a collection, or one group of settings. **No card inside a card.** Rows inside a card use `divide-y`.
4. **Overlays:** modals, slideovers, drawers, menus, popovers. The only surfaces with shadows (Nuxt UI's own).

- **Drawers and bottom sheets don't drag.** A sheet that moves under a finger closes by accident. Use `UDrawer` with its handle and dragging off; it closes with X, a tap outside, Escape or Back. One shared wrapper owns this, built with the first drawer (none yet); ESLint then forbids `UDrawer` elsewhere.
- **Alerts** (`UAlert`, `variant="subtle"`) are for states that need action or explain a blocked action (conflict, shop suspended, load error). A page's standing explanation is a muted sentence, not an alert.

## 9. Action hierarchy

| Level | Style | Rule |
|---|---|---|
| Primary | `UButton` solid, `color="primary"` | **One per page** (the navbar's right, or the bottom bar on a phone), at most one per card or overlay footer |
| Secondary | `color="neutral" variant="outline"` | Cancel, View, Print |
| Tertiary | `variant="ghost"` or `variant="link"` | Inline, low-emphasis actions |
| Destructive trigger | `color="error" variant="soft"` | Cancel order, Archive template, Suspend shop |
| Destructive confirm | The confirm dialog's error button | Only inside a confirm dialog |
| Overflow | `⋮` `UDropdownMenu` (a bottom sheet on a phone) | Everything beyond the one or two visible actions |

- A destructive action is never the primary button, never the only visible action, and always confirms with its effect in words ("Cancel order #61? It stays in the list as cancelled.").
- A disabled action stays visible with its reason (tooltip on wide screens, description in menus and sheets).
- Labels are verb + object. Icons don't replace labels on primary and secondary actions.
- **Order status actions** (Start, Mark ready, Rework, Collect) follow the same rule: the one next step the order is most likely to take is primary; the rest are secondary or in `⋮`.

## 10. Status and badges

- Status is a `UBadge variant="subtle"` **with text**, plus an icon where it helps. Color alone never carries it.
- Badges are for status and counts. Plain attributes (an amount, a phone) are text. A row shows at most two badges.
- **One mapping app-wide**, defined once in the orders feature (M2.3) and reused everywhere:

| Status | Color |
|---|---|
| Received | neutral |
| In progress | info |
| Ready | success |
| Collected | neutral (outline) |
| Cancelled | error |
| Unpaid | warning |
| Paid | success |

Change a color here and in that one mapping, never on a single screen.

## 11. Expected behavior

How controls behave, so every screen behaves the same.

### Overlays

- **Back closes the overlay on top and stays on the page.** A phone's Back is a history back, so each open modal, slideover and drawer gets its own history entry. Back works like Escape on the top overlay only: unsaved input asks first. The next Back leaves the page. Closing another way (X, Save) leaves no entry behind. Shared overlay wrappers own this, built with the first overlay that holds input (edits are pages so far, D22); after that, `UModal`, `USlideover` and `UDrawer` are lint errors outside the wrappers. Until then a confirm dialog (no input) uses `UModal` directly.
- **The backdrop is dark** behind every modal, slideover and drawer, set once in `app.config.ts`.
- **Only an overlay's body scrolls**, between a header and footer that stay in view. A page adds borders or a footer's layout, never spacing.
- **Errors inside an overlay show inside it**, not only as a toast (a toast behind a modal can't be reached).

### Forms and their errors

The full rules are in [forms.md](./forms.md). In short:
- An error appears when the value changes or the form is submitted, **never just because a field was left**.
- An error leaves the moment it's fixed, wherever the fix is.
- A server's field error stays until that field is edited or the form is sent again.
- A failed submit scrolls to and focuses the first invalid field.

### Page banners and retries

- **A banner never disappears for the length of a retry.** An error banner stays while the same action is sent again; the button's loading state shows the work. Clearing it on press makes the page jump.
- It is replaced by the next answer (success, a new error) or removed when it stops being true.
- Its action buttons are disabled while the action runs, so a second press can't start a second request.

### Controls that save when changed

A switch that saves at once (a shop setting toggle) **never blocks the others**: it moves at once, only its own row shows saving, a refused change puts it back and says why. No success toast per change.

### Status actions

- An order action (Start, Mark ready, Collect) disables while it runs and shows loading on its own button.
- A `409` (someone else changed the order, or it's no longer in that status) shows the reason **and reloads the order**, so the screen shows the true state.
- Payment and order create send an `Idempotency-Key` per user action ([architecture → Idempotency](../server/architecture.md#idempotency)); a retry of the same action reuses the key.

## 12. Accessibility (WCAG 2.2 AA minimum)

- **Contrast:** text 4.5:1 (3:1 for large text and UI boundaries), in light and dark mode. Fix a failing shade with one theme variable, never per page.
- **Focus:** never remove focus outlines. After an action, focus goes somewhere sensible: the next row after a removal, the trigger after a dialog closes, the first error after a failed submit.
- **Names:** every control has a visible label or `aria-label`; row actions name their record ("Actions for order #61").
- **Structure:** landmarks from the dashboard shell, headings in order, lists as `ul`/`ol`, tables with headers.
- **Announcements:** async results reach screen readers (toasts, inline alerts, `role="status"` for "Saving… / Saved"). A loading skeleton is `role="status"` with `aria-busy="true"` and an `aria-label`.
- **Input:** everything works by keyboard; nothing is hover-only; gestures have button alternatives.
- **Reflow and zoom:** works at 320 CSS px wide and 200% text zoom without two-dimensional scrolling.
- **Language:** `<html lang>` follows the active locale (`en` or `km`), so screen readers pronounce text correctly.
- **Checked while building:** the `@nuxt/a11y` module runs axe-core in the dev server against WCAG 2.0–2.2 A/AA rules, logs violations to the browser console and lists them in its Nuxt DevTools tab (D5). Fix what it reports before a PR. It's a dev aid, not proof: the e2e accessibility checks (axe in the e2e suite, with the first feature screens in M2) and the [review checklist](./ui-review-checklist.md) still apply.

## 13. Motion

- Use Nuxt UI's transitions. App motion is only state feedback (a row arriving, a spinner), ≤200ms.
- Wrap app transitions in `motion-safe:`; nothing depends on motion.
- No decorative or looping animation.
