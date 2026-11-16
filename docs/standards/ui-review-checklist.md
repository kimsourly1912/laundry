# UI review checklist

← [Docs](../README.md) · Rules: [ui.md](./ui.md) · [responsive-layout.md](./responsive-layout.md) · [page-patterns.md](./page-patterns.md) · [forms.md](./forms.md) · [i18n.md](./i18n.md)

Run this before merging any UI change. Each line checks one rule. A "no" is fixed, or explained in the PR as a known gap and added to [current-state](../current-state.md).

## Verification widths

Check every changed screen at **320, 390, 768, 1024 and 1440 px**, plus one landscape phone (844×390). **In English and in Khmer.** Screenshots at 390 (both languages) and 1440 go in the PR.

## Pattern and composition

- [ ] The page follows one [pattern](./page-patterns.md#1-choose-the-pattern); a deviation is written down with its reason.
- [ ] The compact layout was designed (the four questions in [responsive-layout §2](./responsive-layout.md#2-compact-is-designed-not-shrunk)), not the desktop stacked.
- [ ] Capabilities, permissions, URLs and validation are the same at every width.
- [ ] Layout switches only at `sm` and `lg`; no device detection, no arbitrary breakpoints.
- [ ] Record rows follow the [row composition](./page-patterns.md#row-composition): one record target, a sibling actions trigger, nothing nested.
- [ ] A task flow has one primary action per step, in thumb reach, above the keyboard.
- [ ] No sideways-scrolling table on compact; no two-dimensional scrolling at 320px.
- [ ] Only one bottom bar is visible.

## Visual

- [ ] Nuxt UI components at their default sizes and variants; any change is in `app.config.ts`, never a per-page `ui` override ([ui §1](./ui.md#1-principles)).
- [ ] Tailwind tokens only: no arbitrary values, hex colors or palette classes.
- [ ] Semantic colors keep their meaning; status has text, not color alone ([ui §2](./ui.md#2-color-tokens), [§10](./ui.md#10-status-and-badges)).
- [ ] Status colors come from the one shared mapping.
- [ ] No card inside a card; spacing on the 4px scale.
- [ ] One primary action per page, at most one per card or overlay; destructive actions confirm and are never primary ([ui §9](./ui.md#9-action-hierarchy)).
- [ ] Icons match the one-icon-per-concept table ([ui §7](./ui.md#7-icons)).

## Language

- [ ] No hard-coded strings: every visible string, `aria-label`, title and toast is a key in both `en.json` and `km.json` ([i18n §2](./i18n.md#2-strings)).
- [ ] Khmer text has room: no clipped subscripts, no fixed heights on text, buttons don't overflow at 320px ([i18n §3](./i18n.md#3-khmer-type)).
- [ ] Money, weights and dates use the shared formatters ([i18n §4](./i18n.md#4-money-numbers-and-dates)).
- [ ] Shop data shows in the active language with its fallback ([i18n §5](./i18n.md#5-data-in-two-languages)).

## Touch and keyboard

- [ ] Controls keep Nuxt UI's default sizes; targets ≥ 24×24px with `gap-2` between; a record row is large by its content ([ui §6](./ui.md#6-density-and-touch-targets)).
- [ ] Everything works by keyboard in a logical order; focus is visible.
- [ ] Focus lands sensibly after open, close, save, removal and a failed submit.
- [ ] Icon-only controls and row actions have names that include the record ("Actions for order #61").
- [ ] Bars never hide the focused field or the last content; bottom bars pad the safe area.

## States

For each screen and overlay, show and test the applicable [states](./page-patterns.md#7-states):

- [ ] First load (skeleton, no empty-state flash); refresh keeps content.
- [ ] Nothing shown is later removed or switched on a slow network.
- [ ] Initial empty and filtered empty (with Clear filters).
- [ ] Load error with Retry; not found (detail routes).
- [ ] Signed out / revoked session, forbidden, shop suspended, password change required.
- [ ] Saving (loading control, locked inputs); validation next to fields.
- [ ] Forms follow [forms.md](./forms.md): validation timing, submit button, errors leave when fixed, first error focused.
- [ ] Conflict (`409`): reason + Reload inside the surface.
- [ ] A double tap on a create or payment button makes one request's worth of change.
- [ ] Read-only states (collected, cancelled, anonymized): why, and what still works.
- [ ] Long names, large totals (10,000,000 ៛), zero values, many lines, many rows.

## Accessibility

- [ ] Contrast ≥ 4.5:1 (3:1 for large text and UI boundaries), light and dark mode ([ui §12](./ui.md#12-accessibility-wcag-22-aa-minimum)).
- [ ] Headings in order; lists and tables are semantic; form errors are linked to their fields.
- [ ] Async results are announced (toast, inline alert, `role="status"`).
- [ ] 200% text zoom keeps content usable; nothing depends on hover or motion.
- [ ] `<html lang>` matches the active language.

## Tests

- [ ] e2e covers the compact layout where it differs (a phone-width test: no horizontal overflow, the primary action reachable) and one keyboard path.
- [ ] Each new guard (a hidden action, a read-only state, a conflict path) fails its test when removed.
